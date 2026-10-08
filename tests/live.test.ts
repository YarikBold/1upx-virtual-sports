import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateLive, liveView, liveMarkets, type LiveEvent } from '../server/live.js';
const snapshot = { home: { powerRating: 1680, effectiveStrength: 82 }, away: { powerRating: 1400, effectiveStrength: 68 } };
const start = new Date(0), finish = new Date(240_000);
test('LIVE simulation is deterministic and all event times are bounded', () => {
  const timeline = simulateLive(snapshot, 'secret', 'fixture');
  assert.deepEqual(timeline, simulateLive(snapshot, 'secret', 'fixture'));
  assert.ok(timeline.length > 0);
  assert.ok(timeline.every(e => e.minute >= 1 && e.minute <= 89));
  assert.deepEqual(liveView(timeline, start, finish, -1).timeline, []);
  const end = liveView(timeline, start, finish, 240_000);
  assert.equal(end.minute, 90); assert.equal(end.market_status, 'CLOSED');
  assert.deepEqual(end.score, liveView(timeline, start, finish, 250_000).score);
});
test('VAR suspends markets, confirms only at decision and keeps cancellation audit', () => {
  const timeline: LiveEvent[] = [{ id: '1', minute: 30, type: 'VAR_CHECK', side: 'home', subject: 'GOAL' }, { id: '2', minute: 33, type: 'VAR_DECISION', side: 'home', subject: 'GOAL', confirmed: true }, { id: '3', minute: 40, type: 'VAR_CHECK', side: 'away', subject: 'RED_CARD' }, { id: '4', minute: 43, type: 'VAR_DECISION', side: 'away', subject: 'RED_CARD', confirmed: false }];
  const check = liveView(timeline, start, finish, 31 / 90 * 240_000);
  assert.equal(check.market_status, 'SUSPENDED'); assert.equal(check.score.home, 0);
  assert.equal(check.timeline.length, 1);
  assert.ok(liveMarkets(snapshot, check).every(m => m.status === 'SUSPENDED'));
  const decision = liveView(timeline, start, finish, 34 / 90 * 240_000);
  assert.equal(decision.market_status, 'OPEN'); assert.equal(decision.score.home, 1);
  const cancelled = liveView(timeline, start, finish, 44 / 90 * 240_000);
  assert.equal(cancelled.reds.away, 0); assert.equal(cancelled.timeline.length, 4);
});
test('LIVE prices depend on score, time and red cards', () => {
  const view = liveView([], start, finish, 120_000);
  const baseline = liveMarkets(snapshot, view);
  assert.notDeepEqual(baseline, liveMarkets(snapshot, { ...view, score: { home: 2, away: 0 } }));
  assert.notDeepEqual(baseline, liveMarkets(snapshot, { ...view, reds: { home: 1, away: 0 } }));
});
