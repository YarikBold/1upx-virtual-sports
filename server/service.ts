import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { DAY, sha256, schedule, effectiveStrength, fixtureState, footballMarkets, type FootballMarket } from './domain.js';

import { simulateLive, liveView, liveMarkets, type LiveEvent } from './live.js';
import type { RatingSnapshot } from './domain.js';

export const STARTING_GRANT = 10_000;
export type Db = PrismaClient;

export async function createUser(db: Db) {
  const token = randomBytes(32).toString('hex');
  const user = await db.user.create({ data: { sessions: { create: { tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * DAY) } }, ledger: { create: { amount: STARTING_GRANT, reason: 'STARTING_GRANT', idempotencyKey: 'grant:' + randomUUID() } } } });
  return { id: user.id, token };
}

export async function grant(db: Db, userId: string) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
    const existing = await tx.walletEntry.findFirst({ where: { userId, reason: 'STARTING_GRANT' } });
    if (existing) return existing;
    return tx.walletEntry.create({ data: { userId, amount: STARTING_GRANT, reason: 'STARTING_GRANT', idempotencyKey: 'grant:' + userId } });
  });
}

export async function commitFinishedResults(tx: Parameters<Parameters<Db['$transaction']>[0]>[0], seasonId: string, secret: string, now: number) {
  const fixtures = await tx.fixture.findMany({ where: { seasonId, kickoffAt: { lte: new Date(now) }, finalHomeScore: null } });
  for (const fixture of fixtures) {
    const timeline = fixture.liveTimeline as LiveEvent[] | null ?? simulateLive(fixture.ratingSnapshot as RatingSnapshot, secret, fixture.id);
    // Same deterministic timeline wins on concurrent requests; committed scores are immutable.
    if (fixture.endsAt.getTime() <= now) {
      const { score } = liveView(timeline, fixture.kickoffAt, fixture.endsAt, now);
      await tx.fixture.updateMany({ where: { id: fixture.id, finalHomeScore: null }, data: { finalHomeScore: score.home, finalAwayScore: score.away, resultCommittedAt: new Date(now), liveTimeline: timeline } });
    } else if (!fixture.liveTimeline) await tx.fixture.update({ where: { id: fixture.id }, data: { liveTimeline: timeline } });
  }
}

export async function currentSeason(db: Db, userId: string, now = Date.now()) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
    const expired = await tx.season.findFirst({ where: { userId, status: 'ACTIVE', endsAt: { lte: new Date(now) } }, orderBy: { number: 'desc' } });
    if (expired) {
      await commitFinishedResults(tx, expired.id, expired.secretSeed, now);
      await tx.season.update({ where: { id: expired.id }, data: { status: 'FINISHED' } });
    }
    const existing = await tx.season.findFirst({ where: { userId, status: 'ACTIVE' }, orderBy: { number: 'desc' } });
    if (existing) return existing;
    const teams = await tx.participant.findMany({ where: { sport: 'football' }, orderBy: { id: 'asc' } });
    if (teams.length !== 40) throw new Error('Catalogue not seeded');
    const last = await tx.season.findFirst({ where: { userId }, orderBy: { number: 'desc' } });
    const secretSeed = randomBytes(32).toString('hex');
    const season = await tx.season.create({ data: { id: randomUUID(), userId, number: (last?.number ?? 0) + 1, startedAt: new Date(now), endsAt: new Date(now + DAY), secretSeed, seedCommit: sha256(secretSeed) } });
    const ratings = new Map<string, { powerRating: number; effectiveStrength: number }>();
    for (const team of teams) {
      const powerRating = 1500 + (team.baseRating - 70) * 16;
      const rating = await tx.rating.upsert({ where: { userId_participantId: { userId, participantId: team.id } }, update: {}, create: { userId, participantId: team.id, powerRating, recentForm: [], effectiveStrength: effectiveStrength(team.baseRating, powerRating, []) } });
      ratings.set(team.id, rating);
    }
    const competitions = await tx.competition.findMany({ where: { sport: 'football' } });
    const byName = new Map(competitions.map(c => [c.name, c.id]));
    const fixtures = schedule(season.id, secretSeed, now, teams).map(({ group, ...fixture }) => ({ ...fixture, seasonId: season.id, competitionId: byName.get(group)!, ratingSnapshot: { home: ratings.get(fixture.homeId)!, away: ratings.get(fixture.awayId)! } }));
    await tx.fixture.createMany({ data: fixtures });
    return season;
  }, { timeout: 20_000 });
}

function publicSeason(season: { id: string; number: number; startedAt: Date; endsAt: Date; seedCommit: string; status: string }, now: number) {
  return { season_id: season.id, season_number: season.number, started_at: season.startedAt.toISOString(), ends_at: season.endsAt.toISOString(), server_now: new Date(now).toISOString(), status: season.status, seed_commit: season.seedCommit };
}

async function seasonCounts(db: Db, seasonId: string, now: number) {
  const [upcoming, live] = await Promise.all([
    db.fixture.count({ where: { seasonId, kickoffAt: { gt: new Date(now) } } }),
    db.fixture.count({ where: { seasonId, kickoffAt: { lte: new Date(now) }, endsAt: { gt: new Date(now) } } }),
  ]);
  return { upcoming, live };
}

type FixturePublicInput = { id: string; seasonId: string; competitionId: string; round: number; kickoffAt: Date; endsAt: Date; homeId: string; awayId: string; home: { id: string; name: string; baseRating: number; logoUrl?: string | null }; away: { id: string; name: string; baseRating: number; logoUrl?: string | null }; competition: { id: string; name: string }; finalHomeScore: number | null; finalAwayScore: number | null; ratingSnapshot: unknown; liveTimeline?: unknown };
function fixturePublic(fixture: FixturePublicInput, now: number, markets: FootballMarket[] = []) {
  const state = fixtureState(fixture.kickoffAt, fixture.endsAt, now);
  const live = state !== 'UPCOMING' && Array.isArray(fixture.liveTimeline) ? liveView(fixture.liveTimeline as LiveEvent[], fixture.kickoffAt, fixture.endsAt, now) : null;
  if (state === 'LIVE' && live) {
    const check = live.timeline.at(-1);
    const pricing = live.market_status === 'SUSPENDED' && check ? liveView(fixture.liveTimeline as LiveEvent[], fixture.kickoffAt, fixture.endsAt, fixture.kickoffAt.getTime() + (check.minute - 1) / 90 * (fixture.endsAt.getTime() - fixture.kickoffAt.getTime())) : live;
    markets = liveMarkets(fixture.ratingSnapshot as RatingSnapshot, pricing).map(m => ({ ...m, status: live.market_status }));
  }
  return { minute: live?.minute ?? null, score: state === 'LIVE' ? live?.score ?? null : null, timeline: live?.timeline ?? [], market_status: state === 'FINISHED' ? 'CLOSED' : live?.market_status ?? (state === 'LIVE' ? 'SUSPENDED' : 'OPEN'), fixture_id: fixture.id, season_id: fixture.seasonId, competition_id: fixture.competitionId, league: fixture.competition.name, round: fixture.round, home_team_id: fixture.homeId, away_team_id: fixture.awayId, home_team: { id: fixture.homeId, name: fixture.home.name, initials: fixture.home.name.split(/\s+/).map((part: string) => part[0]).join('').slice(0, 3).toUpperCase(), logoUrl: fixture.home.logoUrl ?? null, base_rating: fixture.home.baseRating }, away_team: { id: fixture.awayId, name: fixture.away.name, initials: fixture.away.name.split(/\s+/).map((part: string) => part[0]).join('').slice(0, 3).toUpperCase(), logoUrl: fixture.away.logoUrl ?? null, base_rating: fixture.away.baseRating }, kickoff_at: fixture.kickoffAt.toISOString(), finish_at: fixture.endsAt.toISOString(), duration_seconds: Math.round((fixture.endsAt.getTime() - fixture.kickoffAt.getTime()) / 1000), status: state, final_score: state === 'FINISHED' && fixture.finalHomeScore !== null ? { home: fixture.finalHomeScore, away: fixture.finalAwayScore } : null, markets, available_markets: markets.length, server_now: new Date(now).toISOString() };
}

async function fixtureQuery(db: Db, seasonId: string, now: number, id?: string) {
  return db.fixture.findMany({ where: { seasonId, ...(id ? { id } : {}) }, include: { home: { select: { id: true, name: true, baseRating: true, logoUrl: true } }, away: { select: { id: true, name: true, baseRating: true, logoUrl: true } }, competition: { select: { id: true, name: true } } }, orderBy: { kickoffAt: 'asc' } });
}

export async function seasonView(db: Db, userId: string, now = Date.now()) {
  const season = await currentSeason(db, userId, now);
  const counts = await seasonCounts(db, season.id, now);
  return { ...publicSeason(season, now), counts, universe: { sport: 'football', fictional: true, leagues: 4, clubs: 40 } };
}

export async function eventsView(db: Db, userId: string, filters: { status?: string; competition?: string; page?: number; pageSize?: number } = {}, now = Date.now()) {
  const season = await currentSeason(db, userId, now);
  const page = Math.max(1, filters.page ?? 1); const pageSize = Math.min(50, Math.max(1, filters.pageSize ?? 24));
  await db.$transaction(tx => commitFinishedResults(tx, season.id, season.secretSeed, now));
  const all = await fixtureQuery(db, season.id, now);
  const filtered = all.filter(f => (!filters.competition || f.competition.id === filters.competition || f.competition.name === filters.competition) && (!filters.status || fixtureState(f.kickoffAt, f.endsAt, now) === filters.status));
  filtered.sort((a, b) => { const sa = fixtureState(a.kickoffAt, a.endsAt, now); const sb = fixtureState(b.kickoffAt, b.endsAt, now); if (!filters.status && sa !== sb) return sa === 'LIVE' ? -1 : sb === 'LIVE' ? 1 : sa === 'UPCOMING' ? -1 : 1; return sa === 'UPCOMING' ? a.kickoffAt.getTime() - b.kickoffAt.getTime() : b.endsAt.getTime() - a.endsAt.getTime(); });
  const items = filtered.slice((page - 1) * pageSize, page * pageSize).map(f => fixturePublic(f, now, footballMarkets(f.ratingSnapshot as never, fixtureState(f.kickoffAt, f.endsAt, now))));
  const counts = await seasonCounts(db, season.id, now);
  return { server_now: new Date(now).toISOString(), season: publicSeason(season, now), competitions: [...new Map(all.map(f => [f.competition.id, { id: f.competition.id, name: f.competition.name }])).values()], counts, filters: { status: filters.status ?? 'ALL', competition: filters.competition ?? 'ALL', page, page_size: pageSize, total: filtered.length, pages: Math.max(1, Math.ceil(filtered.length / pageSize)) }, events: items };
}

export async function eventView(db: Db, userId: string, fixtureId: string, now = Date.now()) {
  const season = await currentSeason(db, userId, now);
  await db.$transaction(tx => commitFinishedResults(tx, season.id, season.secretSeed, now));
  const fixture = (await fixtureQuery(db, season.id, now, fixtureId))[0];
  if (!fixture) return null;
  const state = fixtureState(fixture.kickoffAt, fixture.endsAt, now);
  return { server_now: new Date(now).toISOString(), season: publicSeason(season, now), event: fixturePublic(fixture, now, footballMarkets(fixture.ratingSnapshot as never, state)), form: { home: [], away: [] }, ratings: fixture.ratingSnapshot, markets_status: fixturePublic(fixture, now).market_status };
}

export async function dashboard(db: Db, userId: string, now = Date.now()) {
  const season = await currentSeason(db, userId, now);
  await db.$transaction(tx => commitFinishedResults(tx, season.id, season.secretSeed, now));
  const [sum, fixtures, ratings] = await Promise.all([db.walletEntry.aggregate({ where: { userId }, _sum: { amount: true } }), fixtureQuery(db, season.id, now), db.rating.findMany({ where: { userId }, include: { participant: { select: { name: true, groupName: true, baseRating: true } } }, orderBy: { powerRating: 'desc' } })]);
  return { mode: 'postgres', ...publicSeason(season, now), balance: sum._sum.amount ?? 0, fixtures: fixtures.map(f => fixturePublic(f, now, footballMarkets(f.ratingSnapshot as never, fixtureState(f.kickoffAt, f.endsAt, now)))), ratings: ratings.map(r => ({ name: r.participant.name, league: r.participant.groupName, baseRating: r.participant.baseRating, powerRating: r.powerRating, effectiveStrength: r.effectiveStrength, recentForm: r.recentForm })), capabilities: { betting: false, results: true } };
}
