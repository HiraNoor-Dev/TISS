import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as s from '../src/db/schema';
import type { Database } from '../src/db/types';
import { academicAdminService } from '../src/server/academic-admin';
import { studentManagementService } from '../src/server/student-management';
import { accountService } from '../src/server/accounts';
import { authService } from '../src/server/auth';
import { apiHandler } from '../src/server/http';

test('Academic administration: configuration, scoped students and historical enrollment', async t => {
  const engine = new PGlite();
  const testDb = drizzle(engine, { schema: s });
  const db = testDb as unknown as Database;
  try {
    await migrate(testDb, { migrationsFolder: './drizzle' });
    const password = 'synthetic-test-password-only';
    const passwordHash = await bcrypt.hash(password, 12);
    const [admin, teacher, otherTeacher] = await db.insert(s.users).values([
      { username: 'admin', fullName: 'Admin', role: 'admin', passwordHash, mustChangePassword: false },
      { username: 'teacher', fullName: 'Incharge', role: 'teacher', passwordHash, mustChangePassword: false },
      { username: 'other', fullName: 'Subject teacher', role: 'teacher', passwordHash, mustChangePassword: false },
    ]).returning();
    await db.insert(s.teachers).values([{ userId: teacher.id }, { userId: otherTeacher.id }]);
    const config = academicAdminService(db);
    const students = studentManagementService(db, () => '2026-09-22');
    const accounts = accountService(db);
    const auth = authService(db, 'synthetic-rate-secret-at-least-32-characters');
    const teacherToken = (await auth.login({ username: 'teacher', password })).token;
    const adminToken = (await auth.login({ username: 'admin', password })).token;
    const handler = apiHandler(db, { origin: 'http://localhost:3100', rateSecret: 'synthetic-rate-secret-at-least-32-characters', production: false });
    async function api(path: string, token: string, body?: unknown) {
      return handler(new Request(`http://localhost:3100/api/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: 'http://localhost:3100', 'Content-Type': 'application/json', cookie: `tiss_session=${token}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), path.split('?')[0].split('/'));
    }
    const year = await config.create(admin, 'years', { name: '2026', startsOn: '2026-01-01', endsOn: '2026-12-31' });
    const nextYear = await config.create(admin, 'years', { name: '2027', startsOn: '2027-01-01', endsOn: '2027-12-31' });
    await config.setCurrentYear(admin, year.id);
    const division = await config.create(admin, 'divisions', { name: 'Junior' });
    const grade = await config.create(admin, 'grades', { name: 'Grade 2', divisionId: division.id });
    const section = await config.create(admin, 'sections', { name: 'Pink', gradeId: grade.id });
    const sectionB = await config.create(admin, 'sections', { name: 'Blue', gradeId: grade.id });
    const classA = await config.create(admin, 'classes', { academicYearId: year.id, sectionId: section.id });
    const classB = await config.create(admin, 'classes', { academicYearId: year.id, sectionId: sectionB.id });
    const nextClass = await config.create(admin, 'classes', { academicYearId: nextYear.id, sectionId: section.id });
    const subject = await config.create(admin, 'subjects', { code: 'eng', name: 'English' });
    const incharge = await config.assign(admin, 'incharge', { teacherId: teacher.id, academicClassId: classA.id });
    await config.assign(admin, 'teaching', { teacherId: otherTeacher.id, academicClassId: classA.id, subjectId: subject.id });
    const pupil = await students.create(teacher, { fullName: 'Pupil A', portalId: 'pupil-a', academicClassId: classA.id, startsOn: '2026-01-01' }, classA.id);
    const sibling = await students.create(admin, { fullName: 'Pupil B', portalId: 'pupil-b', academicClassId: classB.id, startsOn: '2026-01-01' });

    await t.test('configuration is admin-only and validates dates, active parents and duplicates', async () => {
      assert.equal((await api('admin/academic', teacherToken)).status, 403);
      assert.equal((await api('admin/academic/subjects', teacherToken, { code: 'ART', name: 'Art' })).status, 403);
      assert.equal((await api('admin/academic/subjects', adminToken, { code: 'ENG', name: 'English' })).status, 409);
      assert.equal((await api('admin/academic/years', adminToken, { name: 'Invalid', startsOn: '2026-12-31', endsOn: '2026-01-01' })).status, 400);
      await assert.rejects(config.setActive(admin, 'years', year.id, { isActive: false }), { status: 400 });
      await config.setActive(admin, 'divisions', division.id, { isActive: false });
      await assert.rejects(config.create(admin, 'sections', { name: 'Red', gradeId: grade.id }), { status: 400 });
      await assert.rejects(students.create(admin, { fullName: 'Invalid', portalId: 'INVALID', academicClassId: classA.id, startsOn: '2026-01-01' }), { status: 400 });
      await config.setActive(admin, 'divisions', division.id, { isActive: true });
      assert.equal((await db.select().from(s.students)).length, 2);
    });
    await t.test('assignment validation, retained revocation and current-year access', async () => {
      await assert.rejects(config.assign(admin, 'incharge', { teacherId: otherTeacher.id, academicClassId: classA.id }));
      await accounts.changeStatus(admin, otherTeacher.id, { status: 'inactive' });
      await assert.rejects(config.assign(admin, 'incharge', { teacherId: otherTeacher.id, academicClassId: classB.id }), { status: 400 });
      await accounts.changeStatus(admin, otherTeacher.id, { status: 'active' });
      await config.setCurrentYear(admin, nextYear.id);
      assert.equal((await students.classOptions(teacher)).length, 0);
      await assert.rejects(students.details(teacher, pupil.id, classA.id), { status: 403 });
      assert.equal((await config.overview(admin)).years.filter(y => y.isCurrent).length, 1);
      await config.setCurrentYear(admin, year.id);
      await config.revoke(admin, 'incharge', incharge.id);
      await assert.rejects(students.details(teacher, pupil.id, classA.id), { status: 403 });
      assert.ok((await db.select().from(s.inchargeAssignments).where(eq(s.inchargeAssignments.id, incharge.id)))[0].revokedAt);
      await config.assign(admin, 'incharge', { teacherId: teacher.id, academicClassId: classA.id });
    });
    await t.test('incharge scope cannot be bypassed with another student, class or injected fields', async () => {
      assert.deepEqual((await students.classOptions(teacher)).map(c => c.id), [classA.id]);
      await assert.rejects(students.details(otherTeacher, pupil.id, classA.id), { status: 403 });
      await assert.rejects(students.details(teacher, sibling.id, classA.id), { status: 403 });
      await assert.rejects(students.create(teacher, { fullName: 'Wrong class', portalId: 'WRONG', academicClassId: classB.id, startsOn: '2026-01-01' }, classA.id), { status: 403 });
      assert.equal((await api(`student-management/${sibling.id}?classId=${classA.id}`, teacherToken)).status, 403);
      assert.equal((await api(`student-management/${pupil.id}/profile?classId=${classA.id}`, teacherToken, { fullName: 'Changed', portalId: 'HACK' })).status, 400);
      assert.equal((await api(`student-management/${pupil.id}/enrollment`, teacherToken, { academicClassId: classB.id, startsOn: '2026-09-22', expectedEnrollmentId: null })).status, 403);
      assert.equal((await api('admin/guardians?q=Pupil', teacherToken)).status, 403);
      assert.equal((await students.list(teacher, { classId: classA.id, page: 1, query: '' })).length, 1);
      assert.equal((await students.list(admin, { page: 1, query: '%' })).length, 0);
    });
    await t.test('guardians support one primary and shared sibling contacts without cross-class edits', async () => {
      const contact = { fullName: 'Parent One', phone: '+923001234567', whatsapp: '', whatsappConsent: false, relationship: 'Mother', isPrimary: true };
      await students.addGuardian(teacher, pupil.id, contact, classA.id);
      const [first] = (await students.details(admin, pupil.id)).guardians;
      await students.addGuardian(admin, sibling.id, { guardianId: first.guardianId, relationship: 'Mother', isPrimary: true });
      await assert.rejects(students.updateGuardian(teacher, pupil.id, first.linkId, { ...contact, phone: '+923009999999' }, classA.id), { status: 403 });
      await students.updateGuardian(teacher, pupil.id, first.linkId, { ...contact, relationship: 'Guardian' }, classA.id);
      await students.addGuardian(teacher, pupil.id, { ...contact, fullName: 'Parent Two', phone: '+923002222222' }, classA.id);
      const links = (await students.details(admin, pupil.id)).guardians;
      assert.equal(links.filter(g => g.isPrimary).length, 1);
      assert.equal(links.find(g => g.isPrimary)?.fullName, 'Parent Two');
      await assert.rejects(students.addGuardian(teacher, pupil.id, { guardianId: first.guardianId, relationship: 'Father', isPrimary: false }, classA.id), { status: 403 });
      await assert.rejects(students.addGuardian(admin, pupil.id, contact), { status: 409 });
      await assert.rejects(students.addGuardian(admin, pupil.id, { ...contact, phone: '03001234567' }));
      assert.equal((await students.guardianSearch(admin, '1234567')).length, 1);
    });
    await t.test('student account linking preserves identity, guardians and enrollment', async () => {
      const account = await accounts.provision(admin, { username: 'pupil-a', fullName: 'Do not replace profile', role: 'student', temporaryPassword: password });
      assert.equal(account.fullName, 'Pupil A');
      let detail = await students.details(admin, pupil.id);
      assert.equal(detail.userId, account.id); assert.equal(detail.history.length, 1); assert.equal(detail.guardians.length, 2);
      assert.equal((await db.select().from(s.students)).length, 2);
      await students.updateProfile(teacher, pupil.id, { fullName: 'Corrected Name' }, classA.id);
      assert.equal((await db.select().from(s.users).where(eq(s.users.id, account.id)))[0].fullName, 'Corrected Name');
      await db.update(s.users).set({ mustChangePassword: false }).where(eq(s.users.id, account.id));
      const token = (await auth.login({ username: 'pupil-a', password })).token;
      assert.equal((await api('student-management/options', token)).status, 403);
      assert.equal((await api(`student-management/${pupil.id}`, token)).status, 403);
      await students.setStatus(teacher, pupil.id, { status: 'withdrawn', effectiveOn: '2026-09-22' }, classA.id);
      await assert.rejects(auth.authenticate(token), { status: 401 });
      await assert.rejects(accounts.changeStatus(admin, account.id, { status: 'active' }), { status: 400 });
      detail = await students.details(admin, pupil.id);
      assert.equal(detail.history[0].endsOn, '2026-09-22');
      await students.setStatus(admin, pupil.id, { status: 'active', effectiveOn: '2026-09-22' });
      assert.equal((await db.select().from(s.users).where(eq(s.users.id, account.id)))[0].status, 'inactive');
      assert.equal((await students.details(admin, pupil.id)).history[0].endsOn, '2026-09-22');
    });
    await t.test('promotion preserves old-year history and rejects stale or invalid requests atomically', async () => {
      const original = (await students.details(admin, sibling.id)).history[0];
      const auditBefore = (await db.select().from(s.auditLogs)).length;
      await assert.rejects(students.enroll(admin, sibling.id, { academicClassId: nextClass.id, startsOn: '2028-01-01', expectedEnrollmentId: original.id }), { status: 400 });
      await assert.rejects(students.enroll(admin, sibling.id, { academicClassId: nextClass.id, startsOn: '2027-01-01', expectedEnrollmentId: null }), { status: 409 });
      assert.equal((await students.details(admin, sibling.id)).history[0].endsOn, null);
      assert.equal((await db.select().from(s.auditLogs)).length, auditBefore);
      await students.enroll(admin, sibling.id, { academicClassId: nextClass.id, startsOn: '2027-01-01', expectedEnrollmentId: original.id });
      const history = (await students.details(admin, sibling.id)).history;
      assert.equal(history.length, 2); assert.equal(history[1].id, original.id); assert.equal(history[1].endsOn, '2026-12-31');
      assert.equal(history[0].academicClassId, nextClass.id);
      await assert.rejects(students.enroll(admin, sibling.id, { academicClassId: classA.id, startsOn: '2026-09-22', expectedEnrollmentId: history[0].id }), { status: 400 });
      assert.equal((await students.details(admin, sibling.id)).history.length, 2);
    });
    await t.test('admin corrections retain identity and reject injected hierarchy or role changes', async () => {
      await config.edit(admin, 'subjects', subject.id, { name: 'English corrected', code: 'ENG2' });
      assert.equal((await db.select().from(s.subjects).where(eq(s.subjects.id, subject.id)))[0].code, 'ENG2');
      await config.edit(admin, 'divisions', division.id, { name: 'Junior corrected' });
      await assert.rejects(config.edit(teacher, 'subjects', subject.id, { name: 'Bad', code: 'BAD' }), { status: 403 });
      await assert.rejects(config.edit(admin, 'grades', grade.id, { name: 'Bad', divisionId: division.id }));
      await accounts.editTeacher(admin, teacher.id, { fullName: 'Corrected Teacher', username: 'teacher-corrected' });
      await assert.rejects(auth.authenticate(teacherToken), { status: 401 });
      assert.ok((await db.select().from(s.inchargeAssignments)).some(a => a.teacherId === teacher.id));
      assert.equal((await api(`admin/accounts/${teacher.id}/edit`, adminToken, { fullName: 'Bad', username: 'teacher', role: 'admin' })).status, 400);
    });
    await t.test('deletion rejects linked history, current years and non-admin requests without partial writes', async () => {
      const auditBefore = (await db.select().from(s.auditLogs)).length;
      await assert.rejects(config.remove(admin, 'years', year.id), { status: 409 });
      for (const [kind, id] of [['divisions', division.id], ['grades', grade.id], ['sections', section.id], ['classes', classA.id], ['subjects', subject.id]] as const) await assert.rejects(config.remove(admin, kind, id), { status: 409 });
      await assert.rejects(config.removeAssignment(admin, 'incharge', incharge.id), { status: 409 });
      await assert.rejects(accounts.removeTeacher(admin, teacher.id), { status: 409 });
      await assert.rejects(config.remove(otherTeacher, 'classes', classB.id), { status: 403 });
      assert.equal((await db.select().from(s.auditLogs)).length, auditBefore);
      assert.ok((await db.select().from(s.teachers)).some(t => t.userId === teacher.id));
    });
    await t.test('unused records can be deleted in dependency order and safe audit snapshots remain', async () => {
      const unused = await accounts.provision(admin, { username: 'mistaken', fullName: 'Mistaken Teacher', role: 'teacher', temporaryPassword: password });
      const extraSection = await config.create(admin, 'sections', { name: 'Mistaken Section', gradeId: grade.id });
      const extraClass = await config.create(admin, 'classes', { academicYearId: year.id, sectionId: extraSection.id });
      const extraSubject = await config.create(admin, 'subjects', { name: 'Mistaken Subject', code: 'MISTAKE' });
      const extraAssignment = await config.assign(admin, 'teaching', { teacherId: unused.id, academicClassId: extraClass.id, subjectId: extraSubject.id });
      await assert.rejects(accounts.removeTeacher(admin, unused.id), { status: 409 });
      assert.ok((await db.select().from(s.teachers)).some(t => t.userId === unused.id));
      await config.removeAssignment(admin, 'teaching', extraAssignment.id);
      await accounts.removeTeacher(admin, unused.id);
      await config.remove(admin, 'classes', extraClass.id);
      await config.remove(admin, 'sections', extraSection.id);
      assert.equal((await api(`admin/academic/subjects/${extraSubject.id}/delete`, adminToken, {})).status, 200);
      assert.equal((await db.select().from(s.users).where(eq(s.users.id, unused.id))).length, 0);
      const audits = await db.select().from(s.auditLogs).where(eq(s.auditLogs.entityId, unused.id));
      assert.ok(audits.some(a => a.action === 'teacher.deleted'));
      assert.ok(!JSON.stringify(audits).includes(password));
      assert.ok(!JSON.stringify(audits).includes('passwordHash'));
    });
  } finally { await engine.close(); }
});
