import football from '../data/football_clubs.json';
import esports from '../data/esports_teams.json';
import hockey from '../data/hockey_clubs.json';
import tennis from '../data/tennis_players.json';
import esportsTournaments from '../data/esports_tournaments.json';
import tennisTournaments from '../data/tennis_tournaments.json';
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g,'');
export const participants = [
  ...football.map(p => ({id:'football:'+slug(p.name),sport:'football',name:p.name,groupName:p.league,baseRating:p.overall,attributes:p})),
  ...esports.map(p => ({id:'esports:'+slug(p.name),sport:'esports',name:p.name,groupName:'Virtual Circuit',baseRating:Math.round((p.aim+p.tactics+p.mental)/3),attributes:p})),
  ...hockey.map(p => ({id:'hockey:'+slug(p.name),sport:'hockey',name:p.name,groupName:p.conference,baseRating:Math.round((p.attack+p.defence+p.goalie)/3),attributes:p})),
  ...tennis.map(p => ({id:'tennis:'+slug(p.name),sport:'tennis',name:p.name,groupName:p.country,baseRating:Math.round((p.serve+p.return+p.mental)/3),attributes:p}))
];
export const competitions = [
  ...[...new Set(football.map(p=>p.league))].map(name=>({id:'football:'+slug(name),sport:'football',name,tier:'LEAGUE',format:'round_robin',metadata:{rounds:9,teams:10}})),
  ...esportsTournaments.map(p=>({id:'esports:'+slug(p.name),sport:'esports',name:p.name,tier:p.tier,format:p.format,metadata:{bestOf:p.tier==='ELITE'?5:3}})),
  ...[...new Set(hockey.map(p=>p.conference))].map(name=>({id:'hockey:'+slug(name),sport:'hockey',name,tier:'LEAGUE',format:'round_robin',metadata:{}})),
  ...tennisTournaments.map((p,i)=>({id:'tennis:'+slug(p.name),sport:'tennis',name:p.name,tier:p.tier,format:'single_elimination',metadata:{surface:['hard','clay','grass'][i%3],bestOf:3}}))
];
