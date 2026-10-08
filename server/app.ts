import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import serveStatic from '@fastify/static';
import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createUser, dashboard, grant, seasonView, eventsView, eventView, startSeason, controlSeason } from './service.js';
import { sha256 } from './domain.js';

function connectionShape(value: string | undefined) {
  if (!value) return { present: false, valid: false };
  try {
    const url = new URL(value);
    return { present: true, valid: url.protocol === 'postgresql:' || url.protocol === 'postgres:', protocol: url.protocol, hostname: url.hostname || null, port: url.port ? Number(url.port) : null, database: url.pathname.replace(/^\//, '') || null, pgbouncer: url.searchParams.get('pgbouncer') === 'true', sslmode: url.searchParams.get('sslmode') ?? null };
  } catch { return { present: true, valid: false }; }
}

function safePrismaMessage(message: string) {
  return message.replace(/postgres(?:ql)?:\/\/[^\s)]+/gi, 'postgresql://[REDACTED]').replace(/(password|passwd|pwd)=([^\s&]+)/gi, '$1=[REDACTED]');
}

export async function createApp(db: PrismaClient) {
  const app = Fastify({ logger: false, bodyLimit: 16_384 });
  await app.register(cookie);
  app.addHook('onRequest', async (req, reply) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.url.startsWith('/api/')) {
      const origin = req.headers.origin;
      if (req.headers['sec-fetch-site'] === 'cross-site' || (origin && new URL(origin).host !== req.headers.host)) return reply.code(403).send({ error: 'Cross-origin request refused' });
    }
  });
  async function userId(req: { cookies: Record<string, string | undefined> }) {
    const token = req.cookies.upx_session;
    if (!token) return null;
    const session = await db.session.findUnique({ where: { tokenHash: sha256(token) } });
    return session && session.expiresAt.getTime() > Date.now() ? session.userId : null;
  }
  async function requireUser(req: { cookies: Record<string, string | undefined> }, reply: { code: (status: number) => { send: (payload: unknown) => unknown } }) {
    const id = await userId(req);
    if (!id) { reply.code(401).send({ error: 'Session required' }); return null; }
    return id;
  }
  app.get('/api/health', async (_req, reply) => {
    try { await db.$queryRaw`SELECT 1`; return { status: 'ok', database: 'postgresql', phase: '1-4', server_now: new Date().toISOString() }; }
    catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
      const message = error instanceof Error ? error.message : String(error);
      const error_code = /Authentication failed|provided database credentials|password authentication failed/i.test(message) ? 'P1000' : /^P1\d{3}$/.test(code) ? code : /ENOTFOUND|EAI_AGAIN/i.test(message) ? 'DNS_ERROR' : /TLS|SSL|certificate/i.test(message) ? 'TLS_ERROR' : /URL|Invalid/i.test(message) ? 'P1013' : 'DATABASE_UNAVAILABLE';
      return reply.code(503).send({ status: 'unavailable', database: 'disconnected', error_code, prisma_message: safePrismaMessage(message), runtime_url: connectionShape(process.env.DATABASE_URL), migration_url: connectionShape(process.env.DIRECT_URL), server_now: new Date().toISOString() });
    }
  });
  app.post('/api/session', async (req, reply) => {
    let id = await userId(req);
    if (!id) { const u = await createUser(db); id = u.id; reply.setCookie('upx_session', u.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 30 * 86400 }); }
    return { userId: id };
  });
  app.get('/api/season', async (req, reply) => { const id = await requireUser(req, reply); return id ? seasonView(db, id) : undefined; });
  app.post('/api/season/start', async (req, reply) => { const id = await requireUser(req, reply); if (!id) return undefined; try { return await startSeason(db, id); } catch (error) { return reply.code(409).send({ error: error instanceof Error ? error.message : 'Season start failed' }); } });
  app.post('/api/season/control', async (req, reply) => { const id = await requireUser(req, reply); if (!id) return undefined; const action = (req.body as { action?: string } | undefined)?.action; if (!['RUN','PAUSE','RESUME','FINISH'].includes(action ?? '')) return reply.code(400).send({ error: 'Invalid season action' }); try { return await controlSeason(db, id, action as 'RUN'|'PAUSE'|'RESUME'|'FINISH'); } catch (error) { return reply.code(409).send({ error: error instanceof Error ? error.message : 'Season control failed' }); } });
  app.get('/api/virtual/events', async (req, reply) => {
    const id = await requireUser(req, reply); if (!id) return undefined;
    const query = req.query as { status?: string; competition?: string; page?: string; page_size?: string };
    const status = query.status && query.status !== 'ALL' ? query.status : undefined;
    return eventsView(db, id, { status, competition: query.competition && query.competition !== 'ALL' ? query.competition : undefined, page: query.page ? Number(query.page) : 1, pageSize: query.page_size ? Number(query.page_size) : 24 });
  });
  app.get('/api/virtual/events/:id', async (req, reply) => { const id = await requireUser(req, reply); if (!id) return undefined; const result = await eventView(db, id, (req.params as { id: string }).id); return result ?? reply.code(404).send({ error: 'Event not found in current season' }); });
  app.get('/api/virtual/events/:id/markets', async (req, reply) => { const id = await requireUser(req, reply); if (!id) return undefined; const result = await eventView(db, id, (req.params as { id: string }).id); return result ? { server_now: result.server_now, fixture_id: result.event.fixture_id, status: result.event.status, markets: result.event.markets } : reply.code(404).send({ error: 'Event not found in current season' }); });
  app.get('/api/dashboard', async (req, reply) => { const id = await requireUser(req, reply); return id ? dashboard(db, id) : undefined; });
  app.post('/api/grant', async (req, reply) => { const id = await requireUser(req, reply); if (!id) return undefined; const entry = await grant(db, id); return { amount: entry.amount, message: 'Одноразовый грант уже начислен' }; });
  app.post('/api/bets', async (_req, reply) => reply.code(409).send({ error: 'Bet acceptance is not implemented before Phase 6' }));
  app.setErrorHandler((err, _req, reply) => { app.log.error(err); reply.code(500).send({ error: 'Server operation failed; check server configuration' }); });
  const root = fileURLToPath(new URL('../dist', import.meta.url));
  if (existsSync(root)) { await app.register(serveStatic, { root }); app.setNotFoundHandler((req, reply) => req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Not found' }) : reply.sendFile('index.html')); }
  return app;
}
