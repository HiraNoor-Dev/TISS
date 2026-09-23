import bcrypt from 'bcryptjs';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/types';
import { auditLogs, sessions, students, teachers, users } from '../db/schema';
import type { Principal } from './auth';
import { requireAdmin } from './permissions';
import { accountInput, password, uuid, username } from './validation';
import { audit, deletionConflict } from './academic-admin';
import { AppError } from './errors';

export function accountService(db: Database) {
  async function provision(actor: Principal, input: unknown) {
    requireAdmin(actor);
    const data = accountInput.parse(input);
    const passwordHash = await bcrypt.hash(data.temporaryPassword, 12);
    return db.transaction(async tx => {
      const [existingProfile] = data.role === 'student' ? await tx.select().from(students).where(eq(students.portalId, data.username.toUpperCase())).for('update') : [];
      if (existingProfile?.userId) throw new AppError(409, 'This student already has an account. Use password reset if needed.');
      if (existingProfile && existingProfile.status !== 'active') throw new AppError(400, 'Set the student status to active before creating an account.');
      const [created] = await tx.insert(users).values({ username: data.username, fullName: existingProfile?.fullName ?? data.fullName, role: data.role, passwordHash }).returning({ id: users.id, username: users.username, fullName: users.fullName, role: users.role });
      if (data.role === 'teacher') await tx.insert(teachers).values({ userId: created.id });
      else if (existingProfile) {
        await tx.update(students).set({ userId: created.id }).where(eq(students.id, existingProfile.id));
        await tx.insert(auditLogs).values({ actorId: actor.id, entityId: existingProfile.id, action: 'student.account_linked', before: { userId: null }, after: { userId: created.id } });
      } else await tx.insert(students).values({ userId: created.id, portalId: created.username.toUpperCase(), fullName: created.fullName });
      await tx.insert(auditLogs).values({ actorId: actor.id, entityId: created.id, action: 'account.created', after: created });
      return created;
    });
  }
  async function changeStatus(actor: Principal, id: string, input: unknown) {
    requireAdmin(actor); uuid.parse(id);
    const { status } = z.object({ status: z.enum(['active', 'inactive', 'suspended']) }).strict().parse(input);
    if (id === actor.id) throw new AppError(400, 'You cannot change your own account status.');
    await db.transaction(async tx => {
      const [old] = await tx.select({ status: users.status, role: users.role }).from(users).where(eq(users.id, id)).for('update');
      if (!old) throw new AppError(404, 'Account not found.');
      // Managing additional admins requires a dedicated policy; avoid last-admin lockout.
      if (old.role === 'admin') throw new AppError(403, 'Administrator account changes are not supported here.');
      if (old.role === 'student' && status === 'active') {
        const [profile] = await tx.select({ status: students.status }).from(students).where(eq(students.userId, id));
        if (!profile || profile.status !== 'active') throw new AppError(400, 'Set the student profile to active before activating the account.');
      }
      await tx.update(users).set({ status, authVersion: sql`${users.authVersion} + 1` }).where(eq(users.id, id));
      await tx.delete(sessions).where(eq(sessions.userId, id));
      await tx.insert(auditLogs).values({ actorId: actor.id, action: 'account.status_changed', entityId: id, before: { status: old.status }, after: { status } });
    });
  }
  async function resetPassword(actor: Principal, id: string, input: unknown) {
    requireAdmin(actor); uuid.parse(id);
    const { temporaryPassword } = z.object({ temporaryPassword: password }).strict().parse(input);
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    await db.transaction(async tx => {
      const rows = await tx.update(users).set({ passwordHash, mustChangePassword: true, authVersion: sql`${users.authVersion} + 1` }).where(and(eq(users.id, id), sql`${users.role} <> 'admin'`)).returning({ id: users.id });
      if (!rows.length) throw new AppError(404, 'Eligible account not found.');
      await tx.delete(sessions).where(eq(sessions.userId, id));
      await tx.insert(auditLogs).values({ actorId: actor.id, action: 'account.password_reset', entityId: id });
    });
  }
  async function list(actor: Principal, page = 1) {
    requireAdmin(actor);
    return db.select({ id: users.id, username: users.username, fullName: users.fullName, role: users.role, status: users.status, mustChangePassword: users.mustChangePassword }).from(users).orderBy(users.username).limit(50).offset((page - 1) * 50);
  }
  async function editTeacher(actor: Principal, id: string, input: unknown) {
    requireAdmin(actor); uuid.parse(id);
    const data = z.object({ fullName: z.string().trim().min(1).max(120), username }).strict().parse(input);
    await db.transaction(async tx => {
      const [before] = await tx.select({ fullName: users.fullName, username: users.username, role: users.role }).from(users).where(eq(users.id, id)).for('update');
      if (!before || before.role !== 'teacher') throw new AppError(404, 'Teacher account not found.');
      await tx.update(users).set({ ...data, authVersion: sql`${users.authVersion} + 1` }).where(eq(users.id, id));
      await tx.delete(sessions).where(eq(sessions.userId, id));
      await audit(tx, actor, 'teacher.edited', id, before, data);
    });
  }
  async function removeTeacher(actor: Principal, id: string) {
    requireAdmin(actor); uuid.parse(id);
    try {
      await db.transaction(async tx => {
        await tx.execute(sql`LOCK TABLE academic_years IN SHARE ROW EXCLUSIVE MODE`);
        const [before] = await tx.select({ id: users.id, fullName: users.fullName, username: users.username, role: users.role, lastLoginAt: users.lastLoginAt }).from(users).where(eq(users.id, id)).for('update');
        if (!before || before.role !== 'teacher') throw new AppError(404, 'Teacher account not found.');
        if (before.lastLoginAt) throw new AppError(409, 'This account has been used. Deactivate it to retain its history.');
        await tx.delete(teachers).where(eq(teachers.userId, id));
        await tx.delete(users).where(eq(users.id, id));
        await audit(tx, actor, 'teacher.deleted', id, before, null);
      });
    } catch (error) { deletionConflict(error); }
  }
  return { provision, changeStatus, resetPassword, list, editTeacher, removeTeacher };
}
