import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../server/app.js';
const db=new PrismaClient();
const app=await createApp(db);
test('HTTP API exposes only current-user season events and server context',async()=>{
 const session=await app.inject({method:'POST',url:'/api/session'});assert.equal(session.statusCode,200);const cookie=(session.headers['set-cookie'] as string).split(';')[0];
 const season=await app.inject({method:'GET',url:'/api/season',headers:{cookie}});assert.equal(season.statusCode,200);const seasonBody=season.json();assert.equal(typeof seasonBody.server_now,'string');assert.equal(seasonBody.season_number,1);
 const events=await app.inject({method:'GET',url:'/api/virtual/events?page_size=5',headers:{cookie}});assert.equal(events.statusCode,200);const body=events.json();assert.equal(body.events.length,5);assert.equal(body.filters.total,100);assert.equal(body.events[0].season_id,seasonBody.season_id);assert.ok(body.events[0].markets.length>0);assert.equal(body.events[0].final_score,null);
 const detail=await app.inject({method:'GET',url:`/api/virtual/events/${body.events[0].fixture_id}`,headers:{cookie}});assert.equal(detail.statusCode,200);assert.equal(detail.json().event.fixture_id,body.events[0].fixture_id);
 const foreign=await app.inject({method:'GET',url:'/api/virtual/events/not-a-real-fixture',headers:{cookie}});assert.equal(foreign.statusCode,404);
 const userId=(await app.inject({method:'POST',url:'/api/session',headers:{cookie}})).json().userId;await db.session.deleteMany({where:{userId}});await db.walletEntry.deleteMany({where:{userId}});await db.rating.deleteMany({where:{userId}});await db.fixture.deleteMany({where:{season:{userId}}});await db.season.deleteMany({where:{userId}});await db.user.delete({where:{id:userId}});
});
test.after(async()=>{await app.close();await db.$disconnect();});
