import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import serveStatic from '@fastify/static';
import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createUser, dashboard, grant } from './service.js';
import { sha256 } from './domain.js';
export async function createApp(db:PrismaClient){
  const app=Fastify({logger:false,bodyLimit:16_384});
  await app.register(cookie);
  app.addHook('onRequest',async(req,reply)=>{
    if(req.method!=='GET'&&req.method!=='HEAD'&&req.url.startsWith('/api/')){
      const origin=req.headers.origin;
      if(req.headers['sec-fetch-site']==='cross-site'||(origin&&new URL(origin).host!==req.headers.host))return reply.code(403).send({error:'Cross-origin request refused'});
    }
  });
  async function userId(req:{cookies:Record<string,string|undefined>}){
    const token=req.cookies.upx_session;
    if(!token)return null;
    const session=await db.session.findUnique({where:{tokenHash:sha256(token)}});
    return session&&session.expiresAt.getTime()>Date.now()?session.userId:null;
  }
  app.get('/api/health',async(_req,reply)=>{
    try{await db.$queryRaw`SELECT 1`;return {status:'ok',database:'postgresql',phase:'1-3'};}catch{return reply.code(503).send({status:'unavailable',database:'disconnected'});}
  });
  app.post('/api/session',async(req,reply)=>{
    let id=await userId(req);
    if(!id){const u=await createUser(db);id=u.id;reply.setCookie('upx_session',u.token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:30*86400});}
    return {userId:id};
  });
  app.get('/api/dashboard',async(req,reply)=>{
    const id=await userId(req);if(!id)return reply.code(401).send({error:'Session required'});
    return dashboard(db,id);
  });
  app.post('/api/grant',async(req,reply)=>{
    const id=await userId(req);if(!id)return reply.code(401).send({error:'Session required'});
    const entry=await grant(db,id);return {amount:entry.amount,message:'Одноразовый грант уже начислен'};
  });
  app.post('/api/bets',async(_req,reply)=>reply.code(409).send({error:'Bet acceptance is not implemented before Phase 6'}));
  app.setErrorHandler((err,_req,reply)=>{app.log.error(err);reply.code(500).send({error:'Server operation failed; check server configuration'});});
  const root=fileURLToPath(new URL('../dist',import.meta.url));
  if(existsSync(root)){await app.register(serveStatic,{root});app.setNotFoundHandler((req,reply)=>req.url.startsWith('/api/')?reply.code(404).send({error:'Not found'}):reply.sendFile('index.html'));}
  return app;
}
