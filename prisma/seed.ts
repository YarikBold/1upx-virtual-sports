import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { participants, competitions } from '../server/catalogue.js';
export async function seed(db: PrismaClient){
  await db.$transaction(async tx=>{
    for(const p of participants)await tx.participant.upsert({where:{id:p.id},create:p,update:p});
    for(const c of competitions)await tx.competition.upsert({where:{id:c.id},create:c,update:c});
  });
}
if(process.argv[1]?.endsWith('seed.ts')){
  const db=new PrismaClient();try{await seed(db);console.log('Seeded',participants.length,'participants and',competitions.length,'competitions');}finally{await db.$disconnect();}
}
