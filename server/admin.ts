import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { currentSeason, eventsView, controlSeason, startSeason, seasonView } from './service.js';
import { simulateLive, type LiveEvent } from './live.js';
import type { RatingSnapshot } from './domain.js';

const ACTIONS = new Set(['GOAL', 'SHOT', 'CORNER', 'FOUL', 'YELLOW_CARD', 'RED_CARD', 'PENALTY', 'VAR_CHECK', 'VAR_DECISION']);

export async function writeAdminLog(db: PrismaClient, actorId: string, action: string, metadata: Record<string, unknown> = {}) {
  return db.adminLog.create({ data: { actorId, action, metadata: metadata as Prisma.InputJsonValue } });
}

export async function adminSeason(db: PrismaClient, adminId: string, now = Date.now()) {
  try { return await currentSeason(db, adminId, now); } catch (error) { if (error instanceof Error && error.message === 'SEASON_NOT_STARTED') return null; throw error; }
}

export async function adminOverview(db: PrismaClient, adminId: string, now = Date.now()) {
  const season = await adminSeason(db, adminId, now);
  const events = season ? await eventsView(db, adminId, { page: 1, pageSize: 50 }, now) : null;
  const [users, logs] = await Promise.all([
    db.user.count(),
    db.adminLog.findMany({ orderBy: { createdAt: 'desc' }, take: 30, include: { actor: { select: { username: true } } } }),
  ]);
  return { server_now: new Date(now).toISOString(), season: season ? await seasonView(db, adminId, now) : null, events, users_count: users, logs: logs.map(log => ({ id: log.id, action: log.action, metadata: log.metadata, actor: log.actor.username, created_at: log.createdAt.toISOString() })) };
}

export async function adminStartSeason(db: PrismaClient, adminId: string, now = Date.now()) {
  const season = await startSeason(db, adminId, now);
  await writeAdminLog(db, adminId, 'SEASON_STARTED', { season_id: season.id, season_number: season.number });
  return season;
}

export async function adminControlSeason(db: PrismaClient, adminId: string, action: 'RUN' | 'PAUSE' | 'RESUME' | 'FINISH', speed?: number, now = Date.now()) {
  const season = await adminSeason(db, adminId, now);
  if (!season) throw new Error('SEASON_NOT_STARTED');
  const updated = await controlSeason(db, adminId, action, now, season.id);
  if (speed !== undefined) await db.season.update({ where: { id: updated.id }, data: { simulationSpeed: Math.max(1, Math.min(60, Math.trunc(speed))) } });
  await writeAdminLog(db, adminId, `SEASON_${action}`, { season_id: updated.id, speed: speed ?? updated.simulationSpeed });
  return db.season.findUniqueOrThrow({ where: { id: updated.id } });
}

export async function adminSetSpeed(db: PrismaClient, adminId: string, speed: number, now = Date.now()) {
  const season = await adminSeason(db, adminId, now);
  if (!season) throw new Error('SEASON_NOT_STARTED');
  const value = Math.max(1, Math.min(60, Math.trunc(speed)));
  const updated = await db.season.update({ where: { id: season.id }, data: { simulationSpeed: value } });
  await writeAdminLog(db, adminId, 'SIMULATION_SPEED_CHANGED', { season_id: season.id, speed: value });
  return updated;
}

export async function adminMatches(db: PrismaClient, adminId: string, now = Date.now()) {
  const season = await adminSeason(db, adminId, now);
  if (!season) return { season: null, events: [] };
  const result = await eventsView(db, adminId, { page: 1, pageSize: 50 }, now);
  return { season: await seasonView(db, adminId, now), events: result.events };
}

export async function adminInjectEvent(db: PrismaClient, adminId: string, fixtureId: string, input: { type?: string; side?: 'home' | 'away'; minute?: number; subject?: string; confirmed?: boolean }, now = Date.now()) {
  if (!input.type || !ACTIONS.has(input.type) || !input.side || !['home', 'away'].includes(input.side)) throw new Error('INVALID_EVENT');
  const minute = Math.max(1, Math.min(92, Math.trunc(input.minute ?? 1)));
  const season = await adminSeason(db, adminId, now);
  if (!season) throw new Error('SEASON_NOT_STARTED');
  const fixture = await db.fixture.findFirst({ where: { id: fixtureId, seasonId: season.id }, select: { id: true, kickoffAt: true, endsAt: true, liveTimeline: true, ratingSnapshot: true, finalHomeScore: true } });
  if (!fixture) throw new Error('EVENT_NOT_FOUND');
  if (fixture.finalHomeScore !== null) throw new Error('MATCH_FINISHED');
  const current = Array.isArray(fixture.liveTimeline) ? fixture.liveTimeline as unknown as LiveEvent[] : simulateLive(fixture.ratingSnapshot as RatingSnapshot, season.secretSeed, fixture.id);
  const event: LiveEvent = { id: `${fixture.id}:admin:${randomUUID()}`, minute, type: input.type, side: input.side, ...(input.subject ? { subject: input.subject } : {}), ...(input.confirmed === undefined ? {} : { confirmed: input.confirmed }) };
  const timeline = [...current, event].sort((a, b) => a.minute - b.minute || a.id.localeCompare(b.id));
  await db.fixture.update({ where: { id: fixture.id }, data: { liveTimeline: timeline } });
  await writeAdminLog(db, adminId, 'MATCH_EVENT_INJECTED', { fixture_id: fixture.id, type: event.type, minute, side: event.side });
  return event;
}

export async function adminUsers(db: PrismaClient) {
  return db.user.findMany({ orderBy: [{ role: 'asc' }, { username: 'asc' }], select: { id: true, username: true, role: true, balance: true, blockedAt: true, createdAt: true } });
}

export async function adminUpdateUser(db: PrismaClient, actorId: string, userId: string, input: { role?: string; balance?: number; blocked?: boolean }) {
  if (input.role !== undefined && !['ADMIN', 'PLAYER'].includes(input.role)) throw new Error('INVALID_ROLE');
  const user = await db.$transaction(async tx => {
    const current = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const nextBalance = input.balance === undefined ? current.balance : Math.max(0, Math.trunc(input.balance));
    if (nextBalance !== current.balance) await tx.walletEntry.create({ data: { userId, amount: nextBalance - current.balance, reason: 'ADMIN_BALANCE_ADJUSTMENT', idempotencyKey: `admin:${actorId}:${userId}:${randomUUID()}` } });
    return tx.user.update({ where: { id: userId }, data: { role: input.role ?? current.role, balance: nextBalance, blockedAt: input.blocked ? new Date() : input.blocked === false ? null : current.blockedAt } });
  });
  await writeAdminLog(db, actorId, 'USER_UPDATED', { user_id: userId, role: input.role, balance: input.balance, blocked: input.blocked });
  return user;
}

export async function adminTeams(db: PrismaClient, adminId: string) {
  const rows = await db.participant.findMany({ where: { sport: 'football' }, orderBy: { groupName: 'asc' }, include: { ratings: { where: { userId: adminId }, select: { powerRating: true, recentForm: true, fatigue: true, effectiveStrength: true } } } });
  return rows.map(team => ({ id: team.id, name: team.name, league: team.groupName, base_rating: team.baseRating, logo_url: team.logoUrl, attributes: team.attributes, rating: team.ratings[0] ?? null }));
}

export async function adminLogs(db: PrismaClient) {
  return db.adminLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { actor: { select: { username: true } } } });
}
