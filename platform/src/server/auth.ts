import { createHash, createHmac, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, eq, gt, sql } from 'drizzle-orm';
import type { Database } from '../db/types';
import { auditLogs, loginBuckets, sessions, users } from '../db/schema';
import { AppError } from './errors';
import { changePasswordInput, loginInput } from './validation';

export const SESSION_SECONDS = 8 * 60 * 60;
export type Principal = { id: string; username: string; fullName: string; role: 'admin' | 'teacher' | 'student'; mustChangePassword: boolean; authVersion: number };
const safeUser = { id: users.id, username: users.username, fullName: users.fullName, role: users.role, mustChangePassword: users.mustChangePassword, authVersion: users.authVersion };
export const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const denyLogin = () => new AppError(401, 'Invalid username or password.');
// A valid cost-12 hash ensures unknown users still perform a password comparison.
const dummyHash = bcrypt.hashSync('unused-random-dummy-credential', 12);

export function authService(db: Database, rateSecret: string) {
  if (rateSecret.length < 32) throw new Error('AUTH_RATE_SECRET must contain at least 32 characters');
  async function consumeBucket(key: string, limit: number, windowSeconds: number) {
    const hashed = createHmac('sha256', rateSecret).update(key).digest('hex');
    const [bucket] = await db.insert(loginBuckets).values({ key: hashed, attempts: 1, resetsAt: new Date(Date.now() + windowSeconds * 1000) })
      .onConflictDoUpdate({ target: loginBuckets.key, set: {
        attempts: sql`CASE WHEN ${loginBuckets.resetsAt} <= now() THEN 1 ELSE ${loginBuckets.attempts} + 1 END`,
        resetsAt: sql`CASE WHEN ${loginBuckets.resetsAt} <= now() THEN now() + ${windowSeconds} * interval '1 second' ELSE ${loginBuckets.resetsAt} END`,
      } }).returning();
    if (bucket.attempts > limit) throw new AppError(429, 'Too many attempts. Please try again later.');
  }
  async function login(input: unknown) {
    const data = loginInput.parse(input);
    await consumeBucket('global-login', 300, 60);
    await consumeBucket(`login:${data.username}`, 10, 15 * 60);
    const [user] = await db.select().from(users).where(eq(users.username, data.username)).limit(1);
    const matches = await bcrypt.compare(data.password, user?.passwordHash ?? dummyHash);
    if (!user || !matches || user.status !== 'active') throw denyLogin();
    const token = randomBytes(32).toString('hex');
    await db.transaction(async tx => {
      // Conditional update locks the account and prevents login racing a reset/deactivation.
      const updated = await tx.update(users).set({ lastLoginAt: new Date() }).where(and(eq(users.id, user.id), eq(users.status, 'active'), eq(users.authVersion, user.authVersion))).returning({ id: users.id });
      if (!updated.length) throw denyLogin();
      await tx.insert(sessions).values({ tokenHash: digest(token), userId: user.id, authVersion: user.authVersion, expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000) });
      await tx.insert(auditLogs).values({ actorId: user.id, action: 'account.login', entityId: user.id });
    });
    return { token, mustChangePassword: user.mustChangePassword };
  }
  async function authenticate(token: string | undefined, allowPasswordChange = false): Promise<Principal> {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new AppError(401, 'Please sign in.');
    const [user] = await db.select(safeUser).from(sessions).innerJoin(users, eq(users.id, sessions.userId)).where(and(
      eq(sessions.tokenHash, digest(token)), gt(sessions.expiresAt, new Date()), eq(users.status, 'active'), eq(sessions.authVersion, users.authVersion),
    )).limit(1);
    if (!user) throw new AppError(401, 'Your session has expired. Please sign in.');
    if (user.mustChangePassword && !allowPasswordChange) throw new AppError(403, 'Change your temporary password before continuing.');
    return user;
  }
  async function logout(token: string | undefined) {
    if (token) await db.delete(sessions).where(eq(sessions.tokenHash, digest(token)));
  }
  async function changePassword(token: string | undefined, input: unknown) {
    const actor = await authenticate(token, true);
    const data = changePasswordInput.parse(input);
    await consumeBucket(`password:${actor.id}`, 10, 15 * 60);
    const [user] = await db.select().from(users).where(eq(users.id, actor.id));
    if (!await bcrypt.compare(data.currentPassword, user.passwordHash)) throw new AppError(400, 'Current password is incorrect.');
    if (await bcrypt.compare(data.newPassword, user.passwordHash)) throw new AppError(400, 'Choose a different password.');
    const passwordHash = await bcrypt.hash(data.newPassword, 12);
    await db.transaction(async tx => {
      const updated = await tx.update(users).set({ passwordHash, mustChangePassword: false, authVersion: sql`${users.authVersion} + 1` }).where(and(eq(users.id, actor.id), eq(users.status, 'active'), eq(users.authVersion, actor.authVersion))).returning({ id: users.id });
      if (!updated.length) throw new AppError(401, 'Your account changed. Please sign in again.');
      await tx.delete(sessions).where(eq(sessions.userId, actor.id));
      await tx.insert(auditLogs).values({ actorId: actor.id, action: 'account.password_changed', entityId: actor.id });
    });
  }
  return { login, authenticate, logout, changePassword };
}
