import { DAY } from './domain.js';
export type SeasonClock = { startedAt: Date; virtualNowMs: bigint | number; simulationState: string; resumedAt: Date | null };
export function elapsedSeason(season: SeasonClock, realNow: number) {
  return Math.min(DAY, Math.max(0, Number(season.virtualNowMs)) + (season.simulationState === 'RUNNING' && season.resumedAt ? Math.max(0, realNow - season.resumedAt.getTime()) : 0));
}
export function simulationNow(season: SeasonClock, realNow: number) { return season.startedAt.getTime() + elapsedSeason(season, realNow); }
