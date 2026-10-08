import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createUser, currentSeason, dashboard, STARTING_GRANT } from '../server/service.js';
const db=new PrismaClient();
test('PostgreSQL persists a user, one-time grant, and 24-hour season',async()=>{
  const user=await createUser(db);const first=await currentSeason(db,user.id,Date.parse('2026-10-08T00:00:00Z'));const second=await currentSeason(db,user.id,Date.parse('2026-10-08T01:00:00Z'));assert.equal(first.id,second.id);assert.equal(first.endsAt.getTime()-first.startedAt.getTime(),86_400_000);const view=await dashboard(db,user.id,Date.parse('2026-10-08T01:00:00Z'));assert.equal(view.balance,STARTING_GRANT);assert.equal(view.fixtures.length,180);assert.equal(view.season.seedCommit.length,64);await db.session.deleteMany({where:{userId:user.id}});await db.walletEntry.deleteMany({where:{userId:user.id}});await db.rating.deleteMany({where:{userId:user.id}});await db.fixture.deleteMany({where:{season:{userId:user.id}}});await db.season.deleteMany({where:{userId:user.id}});await db.user.delete({where:{id:user.id}});
});
test.after(async()=>db.$disconnect());
