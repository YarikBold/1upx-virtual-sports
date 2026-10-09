import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { sha256 } from './domain.js';

export type AuthUser = {
  id: string;
  username: string | null;
  role: string;
  balance: number;
  createdAt: Date;
  blockedAt: Date | null;
};

const SESSION_DAYS = 30;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64, { N: 16_384, r: 8, p: 1 }).toString('hex');
  return `scrypt$16384$8$1$${salt}$${derived}`;
}

export function verifyPassword(password: string, encoded: string | null) {
  if (!encoded) return false;
  const [algorithm, n, r, p, salt, expected] = encoded.split('$');
  if (algorithm !== 'scrypt' || n !== '16384' || r !== '8' || p !== '1' || !salt || !expected || !/^[0-9a-f]{128}$/i.test(expected)) return false;
  try {
    const actual = scryptSync(password, salt, 64, { N: Number(n), r: Number(r), p: Number(p) });
    return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
  } catch { return false; }
}

export async function authenticate(db: PrismaClient, username: string, password: string) {
  const user = await db.user.findUnique({ where: { username } });
  if (!user || user.blockedAt || !verifyPassword(password, user.passwordHash)) return null;
  return user;
}

export async function createSession(db: PrismaClient, userId: string) {
  const token = randomBytes(32).toString('hex');
  await db.session.create({ data: { tokenHash: sha256(token), userId, expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) } });
  return token;
}

export async function revokeSession(db: PrismaClient, token: string | undefined) {
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export async function authenticatedUser(db: PrismaClient, token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session || session.expiresAt.getTime() <= Date.now() || session.user.blockedAt) return null;
  return { id: session.user.id, username: session.user.username, role: session.user.role, balance: session.user.balance, createdAt: session.user.createdAt, blockedAt: session.user.blockedAt };
}

export function publicUser(user: AuthUser) {
  return { id: user.id, username: user.username, role: user.role, balance: user.balance, created_at: user.createdAt.toISOString() };
}


