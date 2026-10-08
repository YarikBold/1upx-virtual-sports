import { createHash, createHmac } from 'node:crypto';
export const DAY = 86_400_000;
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const fixtureSeed = (secret: string, id: string) => createHmac('sha256',secret).update(id).digest('hex');
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo,n));
export function effectiveStrength(base: number,power: number,recent: number[],fatigue=0) {
  const form = recent.slice(-8).reduce((s,r)=>s+r-0.5,0)*1.5;
  return clamp(base+(power-1500)/40+form-clamp(fatigue,0,20)*0.3,35,98);
}
export function elo(home: number, away: number, result: 0|0.5|1) {
  const expected=1/(1+10**((away-home-45)/400));
  const delta=24*(result-expected);
  return [home+delta,away-delta] as const;
}
export type ScheduleParticipant={id:string;groupName:string};
export function schedule(seasonId: string, secret: string, startedAt: number, teams: ScheduleParticipant[]) {
  const groups=[...new Set(teams.map(t=>t.groupName))].sort();
  return groups.flatMap((group,leagueIndex)=>{
    let ring=teams.filter(t=>t.groupName===group).map(t=>t.id).sort();
    if(ring.length!==10) throw new Error('Football league requires 10 teams');
    const rows=[];
    for(let round=0;round<5;round++){
      for(let match=0;match<5;match++){
        const [homeId,awayId]=round%2===0?[ring[match],ring[9-match]]:[ring[9-match],ring[match]];
        const id=sha256(`${seasonId}:${group}:${round}:${match}`).slice(0,32);
        const kickoff=startedAt+300_000+round*9_000_000+leagueIndex*600_000+match*300_000;
        rows.push({id,homeId,awayId,group,round:round+1,kickoffAt:new Date(kickoff),endsAt:new Date(kickoff+240_000),seedCommit:sha256(fixtureSeed(secret,id))});
      }
      ring=[ring[0],ring[9],...ring.slice(1,9)];
    }
    return rows;
  });
}
export function fixtureState(kickoffAt: Date,endsAt: Date,now: number){
  return now<kickoffAt.getTime()?'UPCOMING':now<endsAt.getTime()?'LIVE':'FINISHED';
}
// Phase 4 helpers: price functions receive strengths only, never fixture seeds or final scores.
export function poissonProbability(k: number,lambda: number){
  let f=1;for(let i=2;i<=k;i++)f*=i;
  return Math.exp(-lambda)*lambda**k/f;
}
export function probabilityGrid(home: number,away: number){
  const cells=[];for(let h=0;h<=14;h++)for(let a=0;a<=14;a++)cells.push({h,a,p:poissonProbability(h,home)*poissonProbability(a,away)});
  const total=cells.reduce((s,c)=>s+c.p,0);return cells.map(c=>({...c,p:c.p/total}));
}
export function poissonSample(lambda: number,secret: string,index: number){
  const target=Math.exp(-lambda);let product=1,k=0;
  do {const hex=fixtureSeed(secret,`${index}:${k}`);product*=(parseInt(hex.slice(0,13),16)+0.5)/0x10000000000000;k++;} while(product>target&&k<100);
  return k-1;
}


export type RatingSnapshot = { home: { powerRating: number; effectiveStrength: number }; away: { powerRating: number; effectiveStrength: number } };
export type MarketOutcome = { selection: string; label: string; odds: number; fairProbability: number };
export type FootballMarket = { key: string; group: '1X2' | 'BTTS' | 'TOTALS' | 'HANDICAP'; name: string; line?: number; status: 'OPEN' | 'SUSPENDED' | 'CLOSED'; outcomes: MarketOutcome[] };
const roundedOdds = (probability: number, margin = 0.07) => Math.max(1.01, Math.round((1 / Math.max(0.01, probability * (1 + margin))) * 100) / 100);
const sumProbability = (grid: ReturnType<typeof probabilityGrid>, fn: (h: number, a: number) => boolean) => grid.reduce((sum, cell) => sum + (fn(cell.h, cell.a) ? cell.p : 0), 0);
const outcomes = (values: Array<[string, string, number]>): MarketOutcome[] => values.map(([selection, label, p]) => ({ selection, label, odds: roundedOdds(p), fairProbability: Number(p.toFixed(6)) }));

export function expectedGoalsFromStrength(homeStrength: number, awayStrength: number) {
  return {
    home: clamp(1.35 + (homeStrength - awayStrength) / 28 + 0.16, 0.25, 3.4),
    away: clamp(1.05 + (awayStrength - homeStrength) / 32, 0.2, 3.1),
  };
}

export function footballMarkets(snapshot: RatingSnapshot, state: 'UPCOMING' | 'LIVE' | 'FINISHED', live?: { remaining: number; score: { home: number; away: number } }): FootballMarket[] {
  if (state !== 'UPCOMING') return [];
  const lambdas = expectedGoalsFromStrength(snapshot.home.effectiveStrength, snapshot.away.effectiveStrength);
  const grid = probabilityGrid(lambdas.home * (live?.remaining ?? 1), lambdas.away * (live?.remaining ?? 1)).map(c => ({ ...c, h: c.h + (live?.score.home ?? 0), a: c.a + (live?.score.away ?? 0) }));
  const p1 = sumProbability(grid, (h, a) => h > a);
  const px = sumProbability(grid, (h, a) => h === a);
  const p2 = sumProbability(grid, (h, a) => h < a);
  const bttsYes = sumProbability(grid, (h, a) => h > 0 && a > 0);
  const markets: FootballMarket[] = [{ key: '1x2', group: '1X2', name: '1X2', status: 'OPEN', outcomes: outcomes([['home', 'П1', p1], ['draw', 'X', px], ['away', 'П2', p2]]) }, { key: 'btts', group: 'BTTS', name: 'Обе забьют', status: 'OPEN', outcomes: outcomes([['yes', 'Да', bttsYes], ['no', 'Нет', 1 - bttsYes]]) }];
  for (const line of [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]) {
    const over = sumProbability(grid, (h, a) => h + a > line);
    markets.push({ key: `total-${line}`, group: 'TOTALS', name: `Тотал ${line}`, line, status: 'OPEN', outcomes: outcomes([[`over:${line}`, `ТБ ${line}`, over], [`under:${line}`, `ТМ ${line}`, 1 - over]]) });
  }
  for (const line of [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]) {
    const home = sumProbability(grid, (h, a) => h + line > a);
    markets.push({ key: `handicap-${line}`, group: 'HANDICAP', name: `Фора ${line > 0 ? '+' : ''}${line}`, line, status: 'OPEN', outcomes: outcomes([[`home:${line}`, `П1 ${line > 0 ? '+' : ''}${line}`, home], [`away:${line}`, `П2 ${line > 0 ? '-' : '+'}${Math.abs(line)}`, 1 - home]]) });
  }
  return markets;
}

export function finalScore(snapshot: RatingSnapshot, secret: string, fixtureId: string) {
  const lambdas = expectedGoalsFromStrength(snapshot.home.effectiveStrength, snapshot.away.effectiveStrength);
  return { home: poissonSample(lambdas.home, fixtureSeed(secret, fixtureId), 1), away: poissonSample(lambdas.away, fixtureSeed(secret, fixtureId), 2) };
}
