import { DAY } from './domain.js';
export type SeasonClock = { startedAt: Date; virtualNowMs: bigint | number; simulationState: string; resumedAt: Date | null; simulationSpeed?: number };
export function elapsedSeason(season: SeasonClock, realNow: number) {
  const speed = Math.max(1, Math.min(60, Number(season.simulationSpeed ?? 1)));
  return Math.min(DAY, Math.max(0, Number(season.virtualNowMs)) + (season.simulationState === 'RUNNING' && season.resumedAt ? Math.max(0, realNow - season.resumedAt.getTime()) * speed : 0));
}
export function simulationNow(season: SeasonClock, realNow: number) { return season.startedAt.getTime() + elapsedSeason(season, realNow); }
