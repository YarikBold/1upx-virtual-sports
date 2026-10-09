import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateLive, liveView } from '../server/live.js';
import type { RatingSnapshot } from '../server/domain.js';

const snapshot: RatingSnapshot = {
  home: { powerRating: 1560, effectiveStrength: 78 },
  away: { powerRating: 1490, effectiveStrength: 73 },
};

test('accelerated 100-match LIVE simulation remains deterministic and bounded', () => {
  const kickoff = new Date('2026-10-08T00:00:00Z');
  const finish = new Date(kickoff.getTime() + 90 * 60_000);
  let totalEvents = 0;
  for (let i = 0; i < 100; i++) {
    const id = `audit-fixture-${i}`;
    const first = simulateLive(snapshot, 'audit-seed', id);
    const second = simulateLive(snapshot, 'audit-seed', id);
    assert.deepEqual(first, second);
    assert.ok(first.every(event => event.minute >= 1 && event.minute <= 92));
    const view = liveView(first, kickoff, finish, finish.getTime());
    assert.equal(view.market_status, 'CLOSED');
    assert.ok(view.score.home >= 0 && view.score.away >= 0);
    totalEvents += first.length;
  }
  assert.ok(totalEvents > 0);
});
