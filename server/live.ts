import { clamp, expectedGoalsFromStrength, fixtureSeed, footballMarkets, type RatingSnapshot } from './domain.js';
export type LiveEvent = { id: string; minute: number; type: string; side: 'home' | 'away'; subject?: string; confirmed?: boolean };
export function simulateLive(snapshot: RatingSnapshot, secret: string, id: string): LiveEvent[] {
  const events: LiveEvent[] = [];
  const score = { home: 0, away: 0 }; const reds = { home: 0, away: 0 };
  const random = (key: string) => parseInt(fixtureSeed(secret, `${id}:live-v1:${key}`).slice(0, 12), 16) / 0x1000000000000;
  const push = (minute: number, type: string, side: 'home' | 'away', extra = {}) => events.push({ id: `${id}:${events.length}`, minute, type, side, ...extra });
  for (let minute = 1; minute <= 89; minute++) {
    if (events.some(e => e.type === 'VAR_DECISION' && e.minute >= minute)) continue;
    const strength = (side: 'home' | 'away') => snapshot[side].effectiveStrength + (snapshot[side].powerRating - 1500) / 200 - reds[side] * 12;
    const lambdas = expectedGoalsFromStrength(strength('home'), strength('away'));
    const side = random(`${minute}:side`) < lambdas.home / (lambdas.home + lambdas.away) ? 'home' : 'away';
    const other = side === 'home' ? 'away' : 'home';
    const urgency = score[side] < score[other] ? 1.18 : 1;
    const chance = random(`${minute}:kind`);
    let type = chance < (lambdas.home + lambdas.away) * urgency / 90 ? 'GOAL' : chance < .045 ? 'RED_CARD' : chance < .075 ? 'PENALTY' : chance < .24 ? 'SHOT' : chance < .34 ? 'CORNER' : chance < .45 ? 'FOUL' : chance < .54 ? 'FREE_KICK' : chance < .61 ? 'OFFSIDE' : chance < .68 ? 'YELLOW_CARD' : chance < .70 ? 'INJURY' : '';
    if (!type) continue;
    if (type === 'RED_CARD' && reds[side] >= 3) type = 'FOUL';
    const review = ['GOAL', 'RED_CARD', 'PENALTY'].includes(type) && (type === 'PENALTY' || random(`${minute}:var`) < .45);
    if (review && minute <= 86) {
      push(minute, 'VAR_CHECK', side, { subject: type });
      const confirmed = random(`${minute}:decision`) > .28;
      push(minute + 3, 'VAR_DECISION', side, { subject: type, confirmed });
      if (confirmed) {
        if (type === 'GOAL') score[side]++;
        if (type === 'RED_CARD') reds[side]++;
        if (type === 'PENALTY') { const goal = random(`${minute}:penalty`) < .76; push(minute + 3, goal ? 'GOAL' : 'SHOT', side); if (goal) score[side]++; }
      }
    } else { push(minute, type, side); if (type === 'GOAL') score[side]++; if (type === 'RED_CARD') reds[side]++; }
  }
  return events;
}
export function liveView(timeline: LiveEvent[], kickoff: Date, finish: Date, now: number) {
  const minute = clamp(Math.floor((now - kickoff.getTime()) / (finish.getTime() - kickoff.getTime()) * 90), 0, 90);
  const visible = timeline.filter(e => e.minute <= minute);
  const score = { home: 0, away: 0 }; const reds = { home: 0, away: 0 }; let pending: LiveEvent | undefined;
  for (const e of visible) {
    if (e.type === 'GOAL') score[e.side]++;
    if (e.type === 'RED_CARD') reds[e.side]++;
    if (e.type === 'VAR_CHECK') pending = e;
    if (e.type === 'VAR_DECISION') { pending = undefined; if (e.confirmed && e.subject === 'GOAL') score[e.side]++; if (e.confirmed && e.subject === 'RED_CARD') reds[e.side]++; }
  }
  return { minute, score, reds, timeline: visible, market_status: now >= finish.getTime() ? 'CLOSED' as const : pending ? 'SUSPENDED' as const : 'OPEN' as const };
}
export function liveMarkets(snapshot: RatingSnapshot, view: ReturnType<typeof liveView>) {
  const adjusted = { home: { ...snapshot.home, effectiveStrength: snapshot.home.effectiveStrength - view.reds.home * 12 }, away: { ...snapshot.away, effectiveStrength: snapshot.away.effectiveStrength - view.reds.away * 12 } };
  return footballMarkets(adjusted, 'UPCOMING', { remaining: (90 - view.minute) / 90, minute: view.minute, score: view.score }).map(m => ({ ...m, status: view.market_status }));
}
