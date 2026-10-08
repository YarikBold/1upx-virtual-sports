import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
if(!process.env.DATABASE_URL)throw new Error('Set server-only DATABASE_URL in .env');
const db=new PrismaClient();
const app=await createApp(db);
await app.listen({host:'0.0.0.0',port:Number(process.env.PORT??3001)});
console.log('1UPX API running');
async function stop(){await app.close();await db.$disconnect();process.exit(0);}
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
