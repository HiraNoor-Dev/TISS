import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { correctionService } from '../src/server/corrections';
import { activityService } from '../src/server/activity';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as s from '../src/db/schema';
import type { Database } from '../src/db/types';
import { classroomService } from '../src/server/classroom';
import { reportService } from '../src/server/reports';
import { authService } from '../src/server/auth';
import { apiHandler } from '../src/server/http';

test('Classroom workflow: bulk entry, dated rosters, permissions and immutable history', async t => {
  const engine = new PGlite(); const testDb = drizzle(engine, { schema: s }); const db = testDb as unknown as Database;
  try {
    await migrate(testDb, { migrationsFolder: './drizzle' });
    const password = 'synthetic-classroom-password'; const passwordHash = await bcrypt.hash(password, 12);
    const [teacher, colleague, outsider, admin, pupilUser] = await db.insert(s.users).values([
      { username: 'teacher', fullName: 'English Teacher', role: 'teacher', passwordHash, mustChangePassword: false },
      { username: 'colleague', fullName: 'Math Teacher', role: 'teacher', passwordHash, mustChangePassword: false },
      { username: 'outsider', fullName: 'Other class Teacher', role: 'teacher', passwordHash, mustChangePassword: false },
      { username: 'admin', fullName: 'Admin', role: 'admin', passwordHash, mustChangePassword: false },
      { username: 'student', fullName: 'Student', role: 'student', passwordHash, mustChangePassword: false },
    ]).returning();
    await db.insert(s.teachers).values([teacher, colleague, outsider].map(u => ({ userId: u.id })));
    const [year] = await db.insert(s.academicYears).values({ name: '2026', startsOn: '2026-01-01', endsOn: '2026-12-31', isCurrent: true }).returning();
    const [division] = await db.insert(s.divisions).values({ name: 'Junior' }).returning();
    const [grade] = await db.insert(s.grades).values({ name: 'Grade 2', divisionId: division.id }).returning();
    const [a, b] = await db.insert(s.sections).values([{ name: 'Pink', gradeId: grade.id }, { name: 'Blue', gradeId: grade.id }]).returning();
    const [classA, classB] = await db.insert(s.academicClasses).values([{ academicYearId: year.id, sectionId: a.id }, { academicYearId: year.id, sectionId: b.id }]).returning();
    const [english, math] = await db.insert(s.subjects).values([{ code: 'ENG', name: 'English' }, { code: 'MATH', name: 'Math' }]).returning();
    const [assignment] = await db.insert(s.teachingAssignments).values([
      { teacherId: teacher.id, academicClassId: classA.id, subjectId: english.id },
      { teacherId: colleague.id, academicClassId: classA.id, subjectId: math.id },
      { teacherId: outsider.id, academicClassId: classB.id, subjectId: english.id },
    ]).returning();
    const pupils = await db.insert(s.students).values(Array.from({ length: 501 }, (_, i) => ({ portalId: `P${String(i).padStart(4, '0')}`, fullName: `Synthetic Student ${i}`, ...(i === 0 ? { userId: pupilUser.id } : {}) }))).returning();
    const enrollments = await db.insert(s.enrollments).values(pupils.map(p => ({ studentId: p.id, academicClassId: classA.id, startsOn: '2026-01-01' }))).returning();
    const [foreign] = await db.insert(s.students).values({ portalId: 'OTHER', fullName: 'Other class pupil' }).returning();
    await db.insert(s.enrollments).values({ studentId: foreign.id, academicClassId: classB.id, startsOn: '2026-01-01' });
    const service = classroomService(db, () => '2026-09-22');
    const auth = authService(db, 'synthetic-classroom-secret-at-least-32');
    const handler = apiHandler(db, { origin: 'http://localhost:3100', production: false, rateSecret: 'synthetic-classroom-secret-at-least-32' });
    const teacherToken = (await auth.login({ username: 'teacher', password })).token;
    const studentToken = (await auth.login({ username: 'student', password })).token;
    async function api(path: string, token: string, body?: unknown) {
      return handler(new Request(`http://localhost:3100/api/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { cookie: `tiss_session=${token}`, Origin: 'http://localhost:3100', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), path.split('?')[0].split('/'));
    }
    const definition = { id: randomUUID(), name: 'Reading test', subjectId: english.id, onDate: '2026-09-01', totalMarks: 20, description: 'Synthetic fixture' };
    const assessment = await service.createTest(teacher, classA.id, definition);
    await t.test('new test returns complete 501-student roster before any results; creation retries are safe', async () => {
      const sheet = await service.marks(teacher, classA.id, assessment.id);
      assert.equal(sheet.roster.length, 501); assert.equal(sheet.records.length, 0);
      assert.equal((await service.createTest(teacher, classA.id, definition)).id, assessment.id);
      assert.equal((await db.select().from(s.assessments)).length, 1);
      await assert.rejects(service.createTest(teacher, classA.id, { ...definition, name: 'Different test' }), { status: 409 });
      await assert.rejects(service.createTest(teacher, classA.id, { ...definition, id: randomUUID(), totalMarks: 0 }));
      await assert.rejects(service.createTest(teacher, classA.id, { ...definition, id: randomUUID(), onDate: '2026-09-23' }), { status: 400 });
    });
    await t.test('class and subject scope, student denial, and strict author validation hold at HTTP boundary', async () => {
      await assert.rejects(service.marks(colleague, classA.id, assessment.id), { status: 403 });
      await assert.rejects(service.workspace(outsider, classA.id), { status: 403 });
      await assert.rejects(service.workspace(admin, classA.id), { status: 403 });
      assert.equal((await api(`classroom/${classA.id}/tests/${assessment.id}`, studentToken)).status, 403);
      assert.equal((await api(`classroom/${classA.id}/tests`, teacherToken, { ...definition, id: randomUUID(), authorId: colleague.id })).status, 400);
      await assert.rejects(service.marks(teacher, classB.id, assessment.id), { status: 404 });
      await db.update(s.teachingAssignments).set({ revokedAt: new Date() }).where(eq(s.teachingAssignments.id, assignment.id));
      assert.equal((await api(`classroom/${classA.id}/tests/${assessment.id}`, teacherToken)).status, 403);
      await db.update(s.teachingAssignments).set({ revokedAt: null }).where(eq(s.teachingAssignments.id, assignment.id));
    });
    await t.test('invalid bulk marks write no results or audits; statuses never invent zero marks', async () => {
      const auditBefore = (await db.select().from(s.auditLogs)).length;
      const good = { studentId: pupils[0].id, status: 'present', marks: 0 };
      for (const bad of [
        { studentId: pupils[1].id, status: 'present', marks: 21 },
        { studentId: pupils[1].id, status: 'present', marks: -1 },
        { studentId: pupils[1].id, status: 'present', marks: null },
        { studentId: pupils[1].id, status: 'absent', marks: 0 },
        { studentId: foreign.id, status: 'present', marks: 5 }, good,
      ]) await assert.rejects(service.saveMarks(teacher, classA.id, assessment.id, { version: 0, rows: [good, bad] }));
      assert.equal((await db.select().from(s.testResults)).length, 0);
      assert.equal((await db.select().from(s.auditLogs)).length, auditBefore);
      await service.saveMarks(teacher, classA.id, assessment.id, { version: 0, rows: [good, { studentId: pupils[1].id, status: 'absent', marks: null }, { studentId: pupils[2].id, status: 'not_attempted', marks: null }] });
      const sheet = await service.marks(teacher, classA.id, assessment.id);
      assert.equal(sheet.records.length, 3); assert.equal(sheet.records.find(r => r.studentId === pupils[0].id)?.marks, 0);
      assert.equal(sheet.records.find(r => r.studentId === pupils[1].id)?.marks, null);
      await assert.rejects(service.saveMarks(teacher, classA.id, assessment.id, { version: 0, rows: [good] }), { status: 409 });
      await service.saveMarks(teacher, classA.id, assessment.id, { version: 1, rows: [{ ...good, marks: 8.75 }] });
      assert.equal((await service.marks(teacher, classA.id, assessment.id)).records.length, 3);
      const audits = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, 'result.saved'));
      assert.ok(audits.some(a => (a.before as { marks?: number })?.marks === 0 && (a.after as { marks?: number })?.marks === 8.75));
    });
    await t.test('any assigned teacher can save class attendance; stale concurrent sheets conflict', async () => {
      const empty = await service.attendance(colleague, classA.id, '2026-09-02'); assert.equal(empty.records.length, 0);
      const rows = pupils.map((p, i) => ({ studentId: p.id, status: i === 0 ? 'leave' : i === 1 ? 'absent' : 'present' }));
      const response = await api(`classroom/${classA.id}/attendance?date=2026-09-02`, teacherToken, { version: 0, rows });
      assert.equal(response.status, 200); // Request exceeds the ordinary 16 KB limit.
      const sheet = await service.attendance(colleague, classA.id, '2026-09-02'); assert.equal(sheet.records.length, 501);
      assert.equal(sheet.records.find(r => r.studentId === pupils[0].id)?.status, 'leave');
      await assert.rejects(service.saveAttendance(colleague, classA.id, '2026-09-02', { version: 0, rows }), { status: 409 });
      await service.saveAttendance(colleague, classA.id, '2026-09-02', { version: 1, rows: [{ studentId: pupils[0].id, status: 'present' }] });
      assert.equal((await db.select().from(s.attendanceRecords)).length, 501);
      await assert.rejects(service.saveAttendance(outsider, classA.id, '2026-09-02', { version: 2, rows }), { status: 403 });
      await assert.rejects(service.saveAttendance(teacher, classA.id, '2026-09-02', { version: 2, rows: [{ studentId: pupils[0].id, status: 'late' }] }));
    });
    await t.test('observations are intentional, repeat-safe and owned by the recording teacher', async () => {
      const rows = [{ studentId: pupils[0].id, rating: 'needs_improvement', note: 'Synthetic note' }];
      assert.equal((await service.observations(teacher, classA.id, '2026-09-03', 'uniform')).records.length, 0);
      await service.saveObservations(teacher, classA.id, '2026-09-03', 'uniform', { version: 0, rows });
      await service.saveObservations(teacher, classA.id, '2026-09-03', 'uniform', { version: 1, rows });
      assert.equal((await db.select().from(s.observationRecords)).length, 1);
      assert.equal((await service.observations(colleague, classA.id, '2026-09-03', 'uniform')).records.length, 0);
      await service.saveObservations(colleague, classA.id, '2026-09-03', 'uniform', { version: 0, rows: [{ ...rows[0], rating: 'good', note: 'Separate observation' }] });
      assert.equal((await db.select().from(s.observationRecords)).length, 2);
      assert.equal((await service.observations(teacher, classA.id, '2026-09-03', 'uniform')).records[0].note, 'Synthetic note');
      await assert.rejects(service.saveObservations(teacher, classA.id, '2026-09-03', 'uniform', { version: 2, rows: [rows[0], { ...rows[0], studentId: foreign.id }] }));
      assert.equal((await db.select().from(s.observationRecords)).length, 2);
    });
    await t.test('database rejects excess marks, wrong enrollment and rewrites that invalidate history', async () => {
      const reports = reportService(db); const query = { classId: classA.id, from: '2026-09-01', to: '2026-09-03' };
      const own = await reports.generate(pupilUser, { ...query, audience: 'student' });
      assert.equal(own.students.length, 1); assert.equal(own.marks[0].percentage, 43.75);
      assert.equal(own.attendance[0].present, 1); assert.equal(own.observations.length, 0);
      await assert.rejects(reports.generate(pupilUser, { ...query, audience: 'student', studentId: foreign.id }), { status: 403 });
      await assert.rejects(reports.generate(teacher, { ...query, audience: 'staff', studentId: pupils[0].id }), { status: 403 });
      await assert.rejects(reports.generate(teacher, { ...query, audience: 'class', subjectId: math.id }), { status: 403 });
      const sheet = await reports.generate(teacher, { ...query, audience: 'class', subjectId: english.id });
      assert.equal(sheet.marks.length, 501); assert.equal(sheet.marks.filter(m => m.status === 'not_recorded').length, 498);
      const staff = await reports.generate(admin, { ...query, audience: 'staff', studentId: pupils[0].id });
      assert.equal(staff.observations.length, 2);
      const empty = await reports.generate(admin, { ...query, from: '2026-08-01', to: '2026-08-31', audience: 'staff', studentId: pupils[0].id });
      assert.equal(empty.marks.length, 0); assert.equal(empty.attendance[0].present, 0);
      await assert.rejects(reports.generate(admin, { ...query, from: '2026-09-04', audience: 'class' }));
      assert.equal((await api(`reports?classId=${classA.id}&from=2026-09-01&to=2026-09-03&audience=student`, studentToken)).status, 200);
      const [record] = await db.select().from(s.testResults).where(eq(s.testResults.studentId, pupils[0].id));
      await assert.rejects(db.update(s.testResults).set({ marks: 25 }).where(eq(s.testResults.id, record.id)));
      await assert.rejects(db.update(s.testResults).set({ enrollmentId: enrollments[1].id }).where(eq(s.testResults.id, record.id)));
      await assert.rejects(db.update(s.assessments).set({ totalMarks: 5 }).where(eq(s.assessments.id, assessment.id)));
      await assert.rejects(db.update(s.enrollments).set({ endsOn: '2026-08-31' }).where(eq(s.enrollments.id, enrollments[0].id)));
      await db.update(s.enrollments).set({ endsOn: '2026-09-10' }).where(eq(s.enrollments.id, enrollments[0].id));
      await db.update(s.students).set({ status: 'withdrawn' }).where(eq(s.students.id, pupils[0].id));
      assert.ok((await service.marks(teacher, classA.id, assessment.id)).roster.some(p => p.studentId === pupils[0].id));
      assert.ok(!(await service.attendance(teacher, classA.id, '2026-09-11')).roster.some(p => p.studentId === pupils[0].id));
      await db.update(s.academicYears).set({ isCurrent: false }).where(eq(s.academicYears.id, year.id));
      await assert.rejects(service.marks(teacher, classA.id, assessment.id), { status: 403 });
    });
    await t.test('administrator corrections preserve history, reject stale writes, and audit reasons', async () => {
      const corrections = correctionService(db); const activity = activityService(db);
      const q = { kind: 'marks', classId: classA.id, date: '2026-09-01' };
      await assert.rejects(corrections.list(teacher, q), { status: 403 });
      await assert.rejects(activity.list(pupilUser, {}), { status: 403 });
      assert.equal((await api('admin/activity', teacherToken)).status, 403);
      const [r] = (await corrections.list(admin, q)).records;
      const input = { kind: 'marks', id: r.id, version: r.version, reason: 'Correct transcription error', status: 'present', marks: 12.5 };
      await assert.rejects(corrections.save(teacher, input), { status: 403 });
      await assert.rejects(corrections.save(admin, { ...input, marks: 21 }), { status: 400 });
      await corrections.save(admin, input);
      await assert.rejects(corrections.save(admin, input), { status: 409 });
      const [saved] = await db.select().from(s.testResults).where(eq(s.testResults.id, r.id));
      assert.equal(saved.marks, 12.5); assert.equal(saved.updatedBy, admin.id);
      const logs = await activity.list(admin, { entityId: r.id, action: 'marks.corrected' });
      assert.equal(logs.entries.length, 1); assert.equal((logs.entries[0].after as { reason: string }).reason, input.reason);
      for (const kind of ['attendance', 'observations'] as const) {
        const [row] = (await corrections.list(admin, { kind, classId: classA.id, date: kind === 'attendance' ? '2026-09-02' : '2026-09-03' })).records;
        assert.ok(row);
        const change = { kind, id: row.id, version: row.version, reason: 'Reviewed original school register', ...(kind === 'attendance' ? { status: 'leave' } : { rating: 'good', note: 'Corrected after review' }) };
        await corrections.save(admin, change); await assert.rejects(corrections.save(admin, change), { status: 409 });
      }
      const summary = await activity.summary(admin); assert.equal(summary.activeTeachers, 3);
    });
  } finally { await engine.close(); }
});
