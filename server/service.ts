import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { DAY, sha256, schedule, effectiveStrength, fixtureState } from './domain.js';
export const STARTING_GRANT=10_000;
export async function createUser(db: PrismaClient){
  const token=randomBytes(32).toString('hex');
  const user=await db.user.create({data:{sessions:{create:{tokenHash:sha256(token),expiresAt:new Date(Date.now()+30*DAY)}},ledger:{create:{amount:STARTING_GRANT,reason:'STARTING_GRANT',idempotencyKey:'grant:'+randomUUID()}}}});
  return {id:user.id,token};
}
export async function grant(db:PrismaClient,userId:string){
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
    const existing=await tx.walletEntry.findFirst({where:{userId,reason:'STARTING_GRANT'}});
    if(existing)return existing;
    return tx.walletEntry.create({data:{userId,amount:STARTING_GRANT,reason:'STARTING_GRANT',idempotencyKey:'grant:'+userId}});
  });
}
export async function currentSeason(db:PrismaClient,userId:string,now=Date.now()){
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
    await tx.season.updateMany({where:{userId,status:'ACTIVE',endsAt:{lte:new Date(now)}},data:{status:'FINISHED'}});
    const existing=await tx.season.findFirst({where:{userId,status:'ACTIVE'},orderBy:{number:'desc'}});
    if(existing)return existing;
    const teams=await tx.participant.findMany({where:{sport:'football'},orderBy:{id:'asc'}});
    if(teams.length!==40)throw new Error('Catalogue not seeded');
    const last=await tx.season.findFirst({where:{userId},orderBy:{number:'desc'}});
    const secretSeed=randomBytes(32).toString('hex');
    const season=await tx.season.create({data:{id:randomUUID(),userId,number:(last?.number??0)+1,startedAt:new Date(now),endsAt:new Date(now+DAY),secretSeed,seedCommit:sha256(secretSeed)}});
    const ratings=new Map<string,{powerRating:number;effectiveStrength:number}>();
    for(const t of teams){
      const r=await tx.rating.upsert({where:{userId_participantId:{userId,participantId:t.id}},update:{},create:{userId,participantId:t.id,powerRating:1500+(t.baseRating-70)*16,recentForm:[],effectiveStrength:effectiveStrength(t.baseRating,1500+(t.baseRating-70)*16,[])}});
      ratings.set(t.id,r);
    }
    const competitions=await tx.competition.findMany({where:{sport:'football'}});
    const byName=new Map(competitions.map(c=>[c.name,c.id]));
    await tx.fixture.createMany({data:schedule(season.id,secretSeed,now,teams).map(({group,...f})=>({...f,seasonId:season.id,competitionId:byName.get(group)!,ratingSnapshot:{home:ratings.get(f.homeId)!,away:ratings.get(f.awayId)!}}))});
    return season;
  },{timeout:20_000});
}
export async function dashboard(db:PrismaClient,userId:string,now=Date.now()){
  const season=await currentSeason(db,userId,now);
  const [sum,fixtures,ratings]=await Promise.all([
    db.walletEntry.aggregate({where:{userId},_sum:{amount:true}}),
    db.fixture.findMany({where:{seasonId:season.id},include:{home:{select:{name:true,baseRating:true}},away:{select:{name:true,baseRating:true}},competition:{select:{name:true}}},orderBy:{kickoffAt:'asc'}}),
    db.rating.findMany({where:{userId},include:{participant:{select:{name:true,groupName:true,baseRating:true}}},orderBy:{powerRating:'desc'}})
  ]);
  return {mode:'postgres',serverTime:new Date(now).toISOString(),balance:sum._sum.amount??0,userId,
    season:{id:season.id,number:season.number,startedAt:season.startedAt.toISOString(),endsAt:season.endsAt.toISOString(),seedCommit:season.seedCommit,status:season.status},
    fixtures:fixtures.map(f=>({id:f.id,homeId:f.homeId,awayId:f.awayId,home:f.home.name,away:f.away.name,league:f.competition.name,round:f.round,kickoffAt:f.kickoffAt.toISOString(),endsAt:f.endsAt.toISOString(),state:fixtureState(f.kickoffAt,f.endsAt,now)})),
    ratings:ratings.map(r=>({name:r.participant.name,league:r.participant.groupName,baseRating:r.participant.baseRating,powerRating:r.powerRating,effectiveStrength:r.effectiveStrength,recentForm:r.recentForm})),capabilities:{betting:false,results:false}};
}
