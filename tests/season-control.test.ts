import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createUser, startSeason, controlSeason, currentSeason } from '../server/service.js';

const db = new PrismaClient();
const cleanup = async (userId: string) => {
  await db.session.deleteMany({ where: { userId } });
  await db.walletEntry.deleteMany({ where: { userId } });
  await db.rating.deleteMany({ where: { userId } });
  await db.fixture.deleteMany({ where: { season: { userId } } });
  await db.season.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } });
};

test('season controls are idempotent and pause freezes virtual time', async () => {
  const base = Date.parse('2026-10-08T00:00:00Z');
  const user = await createUser(db);
  try {
    const season = await startSeason(db, user.id, base);
    const ready = await currentSeason(db, user.id, base);
    assert.equal(ready.simulationState, 'READY');
    await controlSeason(db, user.id, 'RUN', base);
    const running = await currentSeason(db, user.id, base + 10_000);
    assert.equal(running.simulationState, 'RUNNING');
    const beforePause = Number(running.virtualNowMs);
    await controlSeason(db, user.id, 'PAUSE', base + 10_000);
    const paused = await currentSeason(db, user.id, base + 3_600_000);
    assert.equal(paused.simulationState, 'PAUSED');
    assert.equal(Number(paused.virtualNowMs), beforePause);
    await controlSeason(db, user.id, 'PAUSE', base + 3_600_000);
    await controlSeason(db, user.id, 'RESUME', base + 3_600_000);
    await controlSeason(db, user.id, 'RESUME', base + 3_600_000);
    const resumed = await currentSeason(db, user.id, base + 3_610_000);
    assert.equal(resumed.simulationState, 'RUNNING');
    assert.ok(Number(resumed.virtualNowMs) > beforePause);
    assert.equal(season.id, resumed.id);
  } finally { await cleanup(user.id); }
});

test('parallel start creates one active season and finish cancels unfinished fixtures', async () => {
  const base = Date.parse('2026-10-08T00:00:00Z');
  const user = await createUser(db);
  try {
    const seasons = await Promise.all(Array.from({ length: 4 }, () => startSeason(db, user.id, base)));
    assert.equal(new Set(seasons.map(s => s.id)).size, 1);
    await controlSeason(db, user.id, 'FINISH', base + 1_000);
    const stored = await db.season.findUniqueOrThrow({ where: { id: seasons[0].id } });
    assert.equal(stored.simulationState, 'FINISHED');
    assert.equal(await db.season.count({ where: { userId: user.id, simulationState: { in: ['READY', 'RUNNING', 'PAUSED', 'FINISHING'] } } }), 0);
    assert.equal(await db.fixture.count({ where: { seasonId: stored.id, cancellationReason: 'SEASON_ENDED_EARLY' } }), 100);
    const next = await startSeason(db, user.id, base + 2_000);
    assert.equal(next.number, 2);
  } finally { await cleanup(user.id); }
});

test.after(async () => db.$disconnect());
