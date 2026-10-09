import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../server/app.js';

const db = new PrismaClient();
const app = await createApp(db);
const cookieOf = (response: { headers: Record<string, unknown> }) => (response.headers['set-cookie'] as string).split(';')[0];

test('closed beta login and role protection', async () => {
  const invalid = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'wrong' } });
  assert.equal(invalid.statusCode, 401);
  const player = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'player01', password: 'player01' } });
  assert.equal(player.statusCode, 200);
  const playerCookie = cookieOf(player);
  assert.equal((await app.inject({ method: 'GET', url: '/api/admin/overview', headers: { cookie: playerCookie } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'GET', url: '/api/profile', headers: { cookie: playerCookie } })).statusCode, 200);
  await db.session.deleteMany({ where: { user: { username: 'player01' } } });
});

test('admin can control season, inspect users and write an action log', async () => {
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'admin123' } });
  assert.equal(login.statusCode, 200);
  const cookie = cookieOf(login);
  assert.equal((await app.inject({ method: 'POST', url: '/api/admin/season/start', headers: { cookie } })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/api/admin/season/speed', headers: { cookie }, payload: { speed: 10 } })).statusCode, 200);
  const overview = await app.inject({ method: 'GET', url: '/api/admin/overview', headers: { cookie } });
  assert.equal(overview.statusCode, 200);
  assert.equal(overview.json().season.simulation_state, 'READY');
  assert.equal((await app.inject({ method: 'GET', url: '/api/admin/users', headers: { cookie } })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/api/admin/teams', headers: { cookie } })).statusCode, 200);
  assert.ok((await app.inject({ method: 'GET', url: '/api/admin/logs', headers: { cookie } })).json().length >= 2);
  await db.session.deleteMany({ where: { user: { username: 'admin' } } });
  const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' } });
  await db.rating.deleteMany({ where: { userId: admin.id } });
  await db.fixture.deleteMany({ where: { season: { userId: admin.id } } });
  await db.season.deleteMany({ where: { userId: admin.id } });
  await db.adminLog.deleteMany({ where: { actorId: admin.id } });
});

test.after(async () => { await app.close(); await db.$disconnect(); });
