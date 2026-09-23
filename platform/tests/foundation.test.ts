import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as s from '../src/db/schema';
import type { Database } from '../src/db/types';
import { authService, digest } from '../src/server/auth';
import { academicService } from '../src/server/academics';
import { requireClassAccess } from '../src/server/permissions';
import { accountService } from '../src/server/accounts';
import { apiHandler, sessionCookie } from '../src/server/http';

test('Foundation integration: migrations, real queries, sessions and contextual access', async t => {
  const engine = new PGlite();
  const testDb = drizzle(engine, { schema: s });
  // Both Drizzle drivers use the PostgreSQL dialect. Only the connection adapter differs.
  const db = testDb as unknown as Database;
  await migrate(testDb, { migrationsFolder: './drizzle' });
  const password = 'test-only-long-passphrase';
  const passwordHash = await bcrypt.hash(password, 12);
  const ids = Object.fromEntries(['admin', 'teacher', 'otherTeacher', 'subjectTeacher', 'student', 'otherStudent', 'year', 'otherYear', 'division', 'grade', 'sectionA', 'sectionB', 'classA', 'classB', 'nextClass', 'english', 'math', 'profileA', 'profileB', 'enrollmentA', 'assignment', 'incharge'].map(k => [k, randomUUID()]));
  for (const [name, role] of [['admin', 'admin'], ['teacher', 'teacher'], ['otherTeacher', 'teacher'], ['subjectTeacher', 'teacher'], ['student', 'student'], ['otherStudent', 'student']] as const) {
    await db.insert(s.users).values({ id: ids[name], username: name.toLowerCase(), fullName: name, passwordHash, role, mustChangePassword: false });
    if (role === 'teacher') await db.insert(s.teachers).values({ userId: ids[name] });
  }
  await db.insert(s.students).values([{ id: ids.profileA, userId: ids.student, portalId: 'STUDENT', fullName: 'Student A' }, { id: ids.profileB, userId: ids.otherStudent, portalId: 'OTHERSTUDENT', fullName: 'Student B' }]);
  await db.insert(s.academicYears).values([{ id: ids.year, name: '2026', startsOn: '2026-01-01', endsOn: '2026-12-31', isCurrent: true }, { id: ids.otherYear, name: '2027', startsOn: '2027-01-01', endsOn: '2027-12-31' }]);
  await db.insert(s.divisions).values({ id: ids.division, name: 'Junior' });
  await db.insert(s.grades).values({ id: ids.grade, divisionId: ids.division, name: 'Grade 2' });
  await db.insert(s.sections).values([{ id: ids.sectionA, gradeId: ids.grade, name: 'Pink' }, { id: ids.sectionB, gradeId: ids.grade, name: 'Blue' }]);
  await db.insert(s.academicClasses).values([{ id: ids.classA, academicYearId: ids.year, sectionId: ids.sectionA }, { id: ids.classB, academicYearId: ids.year, sectionId: ids.sectionB }, { id: ids.nextClass, academicYearId: ids.otherYear, sectionId: ids.sectionA }]);
  await db.insert(s.subjects).values([{ id: ids.english, code: 'ENG', name: 'English' }, { id: ids.math, code: 'MATH', name: 'Mathematics' }]);
  await db.insert(s.enrollments).values([{ id: ids.enrollmentA, studentId: ids.profileA, academicClassId: ids.classA, startsOn: '2026-01-01' }, { studentId: ids.profileB, academicClassId: ids.classB, startsOn: '2026-01-01' }]);
  await db.insert(s.teachingAssignments).values([{ id: ids.assignment, teacherId: ids.teacher, academicClassId: ids.classA, subjectId: ids.english }, { teacherId: ids.otherTeacher, academicClassId: ids.classB, subjectId: ids.english }, { teacherId: ids.subjectTeacher, academicClassId: ids.classA, subjectId: ids.math }]);
  await db.insert(s.inchargeAssignments).values({ id: ids.incharge, teacherId: ids.teacher, academicClassId: ids.classA });
  const [guardian] = await db.insert(s.guardians).values({ fullName: 'Synthetic Guardian', phone: '+10000000000' }).returning();
  await db.insert(s.studentGuardians).values({ studentId: ids.profileA, guardianId: guardian.id, relationship: 'guardian', isPrimary: true });
  const auth = authService(db, 'test-only-rate-secret-not-for-production-1234');
  const academics = academicService(db, () => '2026-09-21'); const accounts = accountService(db);
  const tokens: Record<string, string> = {};
  for (const name of ['admin', 'teacher', 'otherTeacher', 'subjectTeacher', 'student']) tokens[name] = (await auth.login({ username: name.toLowerCase(), password })).token;
  const admin = await auth.authenticate(tokens.admin); const teacher = await auth.authenticate(tokens.teacher); const otherTeacher = await auth.authenticate(tokens.otherTeacher);
  const student = await auth.authenticate(tokens.student); const subjectTeacher = await auth.authenticate(tokens.subjectTeacher);
  const handle = apiHandler(db, { origin: 'http://localhost:3100', rateSecret: 'test-only-rate-secret-not-for-production-1234', production: false });
  async function api(path: string, token?: string, body?: unknown, origin = 'http://localhost:3100') {
    return handle(new Request(`http://localhost:3100/api/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...(token ? { cookie: `tiss_session=${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), path.split('?')[0].split('/'));
  }
  try {
    await t.test('opaque sessions are hashed, expire, and cannot be forged', async () => {
      const [session] = await db.select().from(s.sessions).where(eq(s.sessions.tokenHash, digest(tokens.teacher)));
      assert.equal(session.tokenHash, digest(tokens.teacher)); assert.notEqual(session.tokenHash, tokens.teacher);
      await assert.rejects(auth.authenticate('f'.repeat(64)), { status: 401 });
      await db.update(s.sessions).set({ expiresAt: new Date(0) }).where(eq(s.sessions.tokenHash, session.tokenHash));
      await assert.rejects(auth.authenticate(tokens.teacher), { status: 401 });
      tokens.teacher = (await auth.login({ username: 'teacher', password })).token;
    });
    await t.test('students cannot retrieve class rosters, contacts, or school accounts', async () => {
      for (const path of [`classes/${ids.classA}/roster`, `classes/${ids.classB}/roster`, `classes/${ids.classA}/students/${ids.profileA}/contacts`, 'admin/accounts']) assert.equal((await api(path, tokens.student)).status, 403);
      const profile = await (await api('students/me', tokens.student)).json();
      assert.equal(profile.student.id, ids.profileA); assert.equal(profile.student.enrollments.length, 1);
      assert.ok(!('phone' in profile.student));
      assert.equal((await api(`students/${ids.profileB}`, tokens.student)).status, 404);
    });
    await t.test('class, subject and incharge privileges are separate', async () => {
      const roster = await academics.roster(subjectTeacher, ids.classA);
      assert.equal(roster.length, 1); assert.equal(roster[0].studentId, ids.profileA);
      assert.ok(!('phone' in roster[0])); assert.ok(!('passwordHash' in roster[0]));
      await assert.rejects(academics.roster(otherTeacher, ids.classA), { status: 403 });
      await assert.rejects(academics.contacts(subjectTeacher, ids.classA, ids.profileA), { status: 403 });
      assert.equal((await academics.contacts(teacher, ids.classA, ids.profileA)).length, 1);
      await assert.rejects(academics.contacts(teacher, ids.classB, ids.profileB), { status: 403 });
      await requireClassAccess(db, teacher, ids.classA, 'marks', ids.english);
      await assert.rejects(requireClassAccess(db, teacher, ids.classA, 'marks', ids.math), { status: 403 });
      await assert.rejects(requireClassAccess(db, admin, ids.classA, 'marks', ids.english), { status: 403 });
    });
    await t.test('assignments are grouped by class and revocations take immediate effect', async () => {
      const before = await academics.responsibilities(teacher); assert.equal(before.length, 1); assert.equal(before[0].isIncharge, true);
      await db.update(s.teachingAssignments).set({ revokedAt: new Date() }).where(eq(s.teachingAssignments.id, ids.assignment));
      await assert.rejects(requireClassAccess(db, teacher, ids.classA, 'marks', ids.english), { status: 403 });
      await db.update(s.inchargeAssignments).set({ revokedAt: new Date() }).where(eq(s.inchargeAssignments.id, ids.incharge));
      await assert.rejects(academics.roster(teacher, ids.classA), { status: 403 });
      assert.equal((await academics.responsibilities(teacher)).length, 0);
      await db.update(s.teachingAssignments).set({ revokedAt: null }).where(eq(s.teachingAssignments.id, ids.assignment));
      await db.update(s.inchargeAssignments).set({ revokedAt: null }).where(eq(s.inchargeAssignments.id, ids.incharge));
    });
    await t.test('teachers cannot self-assign or provision accounts; body role injection is rejected', async () => {
      assert.equal((await api('classes/assign', tokens.teacher, { classId: ids.classB })).status, 404);
      assert.equal((await api('admin/accounts', tokens.teacher, {})).status, 403);
      assert.equal((await api('auth/login', undefined, { username: 'student', password, role: 'admin' })).status, 400);
    });
    await t.test('temporary credentials gate data access and password changes revoke every session', async () => {
      const account = await accounts.provision(admin, { username: 'newteacher', fullName: 'New Teacher', role: 'teacher', temporaryPassword: password });
      const a = await auth.login({ username: account.username, password });
      const b = await auth.login({ username: account.username, password });
      assert.equal(a.mustChangePassword, true);
      assert.equal((await api('assignments', a.token)).status, 403);
      assert.equal((await api('auth/me', a.token)).status, 200);
      await auth.changePassword(a.token, { currentPassword: password, newPassword: 'a-new-test-only-passphrase' });
      await assert.rejects(auth.authenticate(a.token), { status: 401 });
      await assert.rejects(auth.authenticate(b.token), { status: 401 });
      await assert.rejects(auth.login({ username: account.username, password }), { status: 401 });
      const c = await auth.login({ username: account.username, password: 'a-new-test-only-passphrase' });
      assert.equal((await auth.authenticate(c.token)).mustChangePassword, false);
      await accounts.resetPassword(admin, account.id, { temporaryPassword: 'reset-test-only-passphrase' });
      await assert.rejects(auth.authenticate(c.token), { status: 401 });
      assert.equal((await auth.login({ username: account.username, password: 'reset-test-only-passphrase' })).mustChangePassword, true);
    });
    await t.test('deactivation blocks login and already-issued tokens even if session row remains', async () => {
      await db.update(s.users).set({ status: 'inactive' }).where(eq(s.users.id, ids.otherTeacher));
      await assert.rejects(auth.authenticate(tokens.otherTeacher), { status: 401 });
      await assert.rejects(auth.login({ username: 'otherteacher', password }), { status: 401 });
      await accounts.changeStatus(admin, ids.otherTeacher, { status: 'active' });
      await assert.rejects(auth.authenticate(tokens.otherTeacher), { status: 401 });
      assert.equal((await db.select().from(s.sessions).where(eq(s.sessions.userId, ids.otherTeacher))).length, 0);
      await assert.rejects(accounts.changeStatus(admin, admin.id, { status: 'inactive' }), { status: 400 });
    });
    await t.test('CSRF, cookie flags, request bounds and error handling work at HTTP boundary', async () => {
      assert.equal((await api('auth/login', undefined, { username: 'teacher', password }, 'https://untrusted.example')).status, 403);
      const good = await api('auth/login', undefined, { username: 'student', password });
      assert.ok(good.headers.get('set-cookie')?.includes('HttpOnly')); assert.ok(good.headers.get('set-cookie')?.includes('SameSite=Lax'));
      assert.ok(!('token' in await good.json()));
      assert.match(sessionCookie('x', true), /^__Host-tiss_session=/); assert.ok(sessionCookie('x', true).includes('; Secure'));
      const huge = await api('auth/login', undefined, { username: 'student', password: 'x'.repeat(20000) }); assert.equal(huge.status, 413);
      assert.equal((await api('admin/accounts?page=0', tokens.admin)).status, 400);
      assert.equal((await api('admin/accounts', 'f'.repeat(64))).status, 401);
      const me = await (await api('auth/me', tokens.admin)).json(); assert.ok(!('passwordHash' in me.user)); assert.ok(!('authVersion' in me.user));
    });
    await t.test('failed student provisioning rolls back both account and audit', async () => {
      const [existingAccount] = await db.insert(s.users).values({ username: 'existingconflict', fullName: 'Existing', role: 'student', passwordHash }).returning();
      await db.insert(s.students).values({ portalId: 'CONFLICT', fullName: 'Existing linked record', userId: existingAccount.id });
      const auditBefore = (await db.select().from(s.auditLogs)).length;
      await assert.rejects(accounts.provision(admin, { username: 'conflict', fullName: 'New', role: 'student', temporaryPassword: password }));
      assert.equal((await db.select().from(s.users).where(eq(s.users.username, 'conflict'))).length, 0);
      assert.equal((await db.select().from(s.auditLogs)).length, auditBefore);
      await assert.rejects(db.insert(s.teachers).values({ userId: ids.student }));
      await assert.rejects(db.update(s.users).set({ role: 'admin' }).where(eq(s.users.id, ids.student)));
    });
    await t.test('duplicate assignments, overlapping enrollment and history rewrites are rejected', async () => {
      await assert.rejects(db.insert(s.teachingAssignments).values({ teacherId: ids.teacher, academicClassId: ids.classA, subjectId: ids.english }));
      await assert.rejects(db.insert(s.inchargeAssignments).values({ teacherId: ids.otherTeacher, academicClassId: ids.classA }));
      await assert.rejects(db.insert(s.enrollments).values({ studentId: ids.profileA, academicClassId: ids.classB, startsOn: '2026-02-01', endsOn: '2026-03-01' }));
      await assert.rejects(db.update(s.enrollments).set({ academicClassId: ids.classB }).where(eq(s.enrollments.id, ids.enrollmentA)));
      await assert.rejects(db.update(s.academicClasses).set({ academicYearId: ids.otherYear }).where(eq(s.academicClasses.id, ids.classA)));
      await assert.rejects(db.insert(s.enrollments).values({ studentId: ids.profileA, academicClassId: ids.nextClass, startsOn: '2028-01-01' }));
      await db.transaction(async tx => {
        await tx.update(s.enrollments).set({ endsOn: '2026-12-31' }).where(eq(s.enrollments.id, ids.enrollmentA));
        await tx.insert(s.enrollments).values({ studentId: ids.profileA, academicClassId: ids.nextClass, startsOn: '2027-01-01' });
      });
      const profile = await academics.ownProfile(student); assert.equal(profile.enrollments.length, 2); assert.equal(profile.enrollments[0].year, '2026'); assert.equal(profile.enrollments[1].year, '2027');
    });
    await t.test('audit events are append-only and contain no credentials', async () => {
      const events = await db.select().from(s.auditLogs); assert.ok(events.length > 0);
      assert.ok(!JSON.stringify(events).includes(password)); assert.ok(!JSON.stringify(events).includes(passwordHash)); assert.ok(!JSON.stringify(events).includes(tokens.admin));
      await assert.rejects(db.update(s.auditLogs).set({ action: 'tampered' }));
      await assert.rejects(db.delete(s.auditLogs));
      await assert.rejects(engine.exec('TRUNCATE audit_logs'));
    });
    await t.test('login throttling is persisted and logout revokes the server session', async () => {
      for (let i = 0; i < 10; i++) await assert.rejects(auth.login({ username: 'unknownperson', password }), { status: 401 });
      await assert.rejects(auth.login({ username: 'unknownperson', password }), { status: 429 });
      await auth.logout(tokens.student); await assert.rejects(auth.authenticate(tokens.student), { status: 401 });
    });
  } finally { await engine.close(); }
});
