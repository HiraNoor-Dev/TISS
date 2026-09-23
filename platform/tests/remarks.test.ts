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
import { remarkService } from '../src/server/remarks';
import { reportService } from '../src/server/reports';
import { authService } from '../src/server/auth';
import { apiHandler } from '../src/server/http';

test('Remarks: approval, audience isolation, author ownership and historical integrity', async t => {
  const engine = new PGlite(); const testDb = drizzle(engine, { schema: s }); const db = testDb as unknown as Database;
  try {
    await migrate(testDb, { migrationsFolder: './drizzle' });
    const password = 'synthetic-remarks-test-password'; const passwordHash = await bcrypt.hash(password, 12);
    const [admin, teacher, incharge, colleague, outsider, student, otherStudent] = await db.insert(s.users).values([
      { username: 'admin', fullName: 'Admin', role: 'admin', passwordHash, mustChangePassword: false },
      { username: 'teacher', fullName: 'Teacher', role: 'teacher', passwordHash, mustChangePassword: false },
      { username: 'incharge', fullName: 'Incharge', role: 'teacher', passwordHash, mustChangePassword: false },
      { username: 'colleague', fullName: 'Colleague', role: 'teacher', passwordHash, mustChangePassword: false },
      { username: 'outsider', fullName: 'Outsider', role: 'teacher', passwordHash, mustChangePassword: false },
      { username: 'student', fullName: 'Student', role: 'student', passwordHash, mustChangePassword: false },
      { username: 'otherstudent', fullName: 'Other Student', role: 'student', passwordHash, mustChangePassword: false },
    ]).returning();
    await db.insert(s.teachers).values([teacher, incharge, colleague, outsider].map(u => ({ userId: u.id })));
    const [year] = await db.insert(s.academicYears).values({ name: '2026', startsOn: '2026-01-01', endsOn: '2026-12-31', isCurrent: true }).returning();
    const [division] = await db.insert(s.divisions).values({ name: 'Junior' }).returning();
    const [grade] = await db.insert(s.grades).values({ name: 'Grade 2', divisionId: division.id }).returning();
    const [section, otherSection] = await db.insert(s.sections).values([{ name: 'Pink', gradeId: grade.id }, { name: 'Blue', gradeId: grade.id }]).returning();
    const [cls, otherClass] = await db.insert(s.academicClasses).values([{ academicYearId: year.id, sectionId: section.id }, { academicYearId: year.id, sectionId: otherSection.id }]).returning();
    const [subject] = await db.insert(s.subjects).values({ code: 'ENG', name: 'English' }).returning();
    await db.insert(s.teachingAssignments).values([teacher, colleague].map(u => ({ teacherId: u.id, academicClassId: cls.id, subjectId: subject.id })));
    const [charge] = await db.insert(s.inchargeAssignments).values({ teacherId: incharge.id, academicClassId: cls.id }).returning();
    await db.insert(s.inchargeAssignments).values({ teacherId: outsider.id, academicClassId: otherClass.id });
    const [pupil, otherPupil] = await db.insert(s.students).values([{ portalId: 'STUDENT', fullName: 'Pupil A', userId: student.id }, { portalId: 'OTHERSTUDENT', fullName: 'Pupil B', userId: otherStudent.id }]).returning();
    const [enrollment] = await db.insert(s.enrollments).values([{ studentId: pupil.id, academicClassId: cls.id, startsOn: '2026-01-01' }, { studentId: otherPupil.id, academicClassId: otherClass.id, startsOn: '2026-01-01' }]).returning();
    const remarks = remarkService(db, () => '2026-09-22');
    const input = { id: randomUUID(), studentId: pupil.id, onDate: '2026-09-01', category: 'academic', content: 'Internal teaching note', parentVisible: false, studentVisible: false };
    const internal = await remarks.create(teacher, cls.id, input);
    const pending = await remarks.create(teacher, cls.id, { ...input, id: randomUUID(), content: 'Positive progress', parentVisible: true, studentVisible: true });
    const auth = authService(db, 'synthetic-remarks-rate-secret-at-least-32');
    const handler = apiHandler(db, { origin: 'http://localhost:3100', production: false, rateSecret: 'synthetic-remarks-rate-secret-at-least-32' });
    const teacherToken = (await auth.login({ username: 'teacher', password })).token;
    const studentToken = (await auth.login({ username: 'student', password })).token;
    async function api(path: string, token: string, body?: unknown) {
      return handler(new Request(`http://localhost:3100/api/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { cookie: `tiss_session=${token}`, Origin: 'http://localhost:3100', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), path.split('?')[0].split('/'));
    }
    await t.test('internal and pending remarks are hidden externally; staff reads are scoped', async () => {
      assert.equal(internal.status, 'internal'); assert.equal(pending.status, 'pending');
      assert.equal((await remarks.ownVisible(student)).length, 0);
      assert.equal((await remarks.parentVisible(incharge, cls.id, pupil.id)).length, 0);
      assert.equal((await remarks.list(colleague, cls.id)).records.length, 0);
      assert.equal((await remarks.list(incharge, cls.id)).records.length, 2);
      await assert.rejects(remarks.list(outsider, cls.id), { status: 403 });
      assert.equal((await api(`remarks?classId=${cls.id}`, studentToken)).status, 403);
      await assert.rejects(remarks.create(teacher, cls.id, { ...input, id: randomUUID(), studentId: otherPupil.id }), { status: 400 });
      assert.equal((await remarks.create(teacher, cls.id, input)).id, internal.id);
      assert.equal((await db.select().from(s.remarks)).length, 2);
    });
    await t.test('only admin or assigned incharge can approve; callers cannot inject approval', async () => {
      assert.equal((await api(`remarks/${pending.id}/review`, teacherToken, { version: 0, decision: 'approve', note: '' })).status, 403);
      await assert.rejects(remarks.review(outsider, pending.id, { version: 0, decision: 'approve', note: '' }), { status: 403 });
      assert.equal((await api(`remarks?classId=${cls.id}`, teacherToken, { ...input, id: randomUUID(), status: 'approved', approvedBy: admin.id })).status, 400);
      await remarks.review(incharge, pending.id, { version: 0, decision: 'approve', note: 'Private review note' });
      const visible = await (await api('students/me/remarks', studentToken)).json();
      assert.equal(visible.remarks.length, 1); assert.equal(visible.remarks[0].content, 'Positive progress');
      assert.deepEqual(Object.keys(visible.remarks[0]).sort(), ['category', 'content', 'id', 'onDate']);
      assert.ok(!JSON.stringify(visible).includes('Private review note'));
      assert.equal((await remarks.ownVisible(otherStudent)).length, 0);
      assert.equal((await remarks.parentVisible(admin, cls.id, pupil.id)).length, 1);
      await assert.rejects(remarks.parentVisible(teacher, cls.id, pupil.id), { status: 403 });
    });
    await t.test('editing approval resets visibility and stale review cannot approve changed text', async () => {
      const edit = { category: 'general', content: 'Changed text needs review', parentVisible: true, studentVisible: true, version: 1 };
      await assert.rejects(remarks.edit(colleague, pending.id, edit), { status: 403 });
      await remarks.edit(teacher, pending.id, edit);
      assert.equal((await remarks.ownVisible(student)).length, 0); assert.equal((await remarks.parentVisible(admin, cls.id, pupil.id)).length, 0);
      await assert.rejects(remarks.review(admin, pending.id, { version: 1, decision: 'approve', note: '' }), { status: 409 });
      await remarks.review(admin, pending.id, { version: 2, decision: 'approve', note: '' });
      assert.equal((await remarks.ownVisible(student))[0].content, edit.content);
      await assert.rejects(db.update(s.remarks).set({ content: 'Bypass approval' }).where(eq(s.remarks.id, pending.id)));
    });
    await t.test('audience flags are independent and rejection withdraws visibility immediately', async () => {
      const parent = await remarks.create(teacher, cls.id, { ...input, id: randomUUID(), content: 'Parent only', parentVisible: true });
      await remarks.review(admin, parent.id, { version: 0, decision: 'approve', note: '' });
      assert.ok(!(await remarks.ownVisible(student)).some(r => r.id === parent.id));
      assert.ok((await remarks.parentVisible(admin, cls.id, pupil.id)).some(r => r.id === parent.id));
      const studentOnly = await remarks.create(teacher, cls.id, { ...input, id: randomUUID(), content: 'Student only', studentVisible: true });
      await remarks.review(admin, studentOnly.id, { version: 0, decision: 'approve', note: '' });
      assert.ok((await remarks.ownVisible(student)).some(r => r.id === studentOnly.id));
      assert.ok(!(await remarks.parentVisible(admin, cls.id, pupil.id)).some(r => r.id === studentOnly.id));
      const reports = reportService(db); const query = { classId: cls.id, from: '2026-09-01', to: '2026-09-01' };
      const parentReport = await reports.generate(admin, { ...query, studentId: pupil.id, audience: 'parent' });
      assert.ok(parentReport.remarks.some(r => r.content === 'Parent only'));
      assert.ok(!parentReport.remarks.some(r => r.content === 'Student only' || r.content === input.content));
      const studentReport = await reports.generate(student, { ...query, audience: 'student' });
      assert.ok(studentReport.remarks.some(r => r.content === 'Student only'));
      assert.ok(!JSON.stringify(studentReport).includes('Private review note'));
      assert.ok(!studentReport.remarks.some(r => r.content === 'Parent only' || r.content === input.content));
      await remarks.review(admin, pending.id, { version: 3, decision: 'reject', note: 'Withdraw for correction' });
      assert.ok(!(await remarks.ownVisible(student)).some(r => r.id === pending.id));
      await assert.rejects(remarks.review(admin, internal.id, { version: 0, decision: 'approve', note: '' }), { status: 400 });
      await assert.rejects(remarks.review(admin, parent.id, { version: 1, decision: 'reject', note: '' }));
    });
    await t.test('revocation removes review authority and database preserves dated author history', async () => {
      await db.update(s.inchargeAssignments).set({ revokedAt: new Date() }).where(eq(s.inchargeAssignments.id, charge.id));
      await assert.rejects(remarks.review(incharge, pending.id, { version: 4, decision: 'reject', note: 'No longer authorized' }), { status: 403 });
      await assert.rejects(db.update(s.remarks).set({ authorId: colleague.id }).where(eq(s.remarks.id, internal.id)));
      await assert.rejects(db.update(s.remarks).set({ status: 'approved' }).where(eq(s.remarks.id, internal.id)));
      await assert.rejects(db.update(s.enrollments).set({ endsOn: '2026-08-31' }).where(eq(s.enrollments.id, enrollment.id)));
      const audits = await db.select().from(s.auditLogs).where(eq(s.auditLogs.entityId, pending.id));
      assert.ok(audits.some(a => a.action === 'remark.edited'));
      assert.ok(audits.some(a => a.action === 'remark.approved'));
      assert.ok(audits.some(a => a.action === 'remark.visibility_rejected'));
    });
  } finally { await engine.close(); }
});
