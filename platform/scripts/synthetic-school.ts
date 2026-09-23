import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as s from '../src/db/schema';
import { classroomService } from '../src/server/classroom';
import { correctionService } from '../src/server/corrections';
import { remarkService } from '../src/server/remarks';
import { schoolToday } from '../src/server/academic-admin';

// Called only with the freshly created synthetic database in verify-restore.ts.
export async function verifySyntheticSchool(pool: pg.Pool) {
  const db = drizzle(pool, { schema: s }); await migrate(db, { migrationsFolder: './drizzle' });
  const passwordHash = await bcrypt.hash('Synthetic-preview-only-2509', 12);
  const [admin, teacher, student] = await db.insert(s.users).values([
    { username: 'preview-admin', fullName: 'Preview Administrator', role: 'admin', passwordHash, mustChangePassword: false },
    { username: 'preview-teacher', fullName: 'Preview Teacher', role: 'teacher', passwordHash, mustChangePassword: false },
    { username: 'preview-student', fullName: 'Preview Student', role: 'student', passwordHash, mustChangePassword: false },
  ]).returning();
  await db.insert(s.teachers).values({ userId: teacher.id });
  const date = schoolToday(); const yearText = date.slice(0, 4);
  const [year] = await db.insert(s.academicYears).values({ name: `Preview ${yearText}`, startsOn: `${yearText}-01-01`, endsOn: `${yearText}-12-31`, isCurrent: true }).returning();
  const [division] = await db.insert(s.divisions).values({ name: 'Junior' }).returning();
  const [grade] = await db.insert(s.grades).values({ name: 'Grade 2', divisionId: division.id }).returning();
  const [section] = await db.insert(s.sections).values({ name: 'Blue', gradeId: grade.id }).returning();
  const [cls] = await db.insert(s.academicClasses).values({ academicYearId: year.id, sectionId: section.id }).returning();
  const [subject] = await db.insert(s.subjects).values({ code: 'ENG', name: 'English' }).returning();
  await db.insert(s.teachingAssignments).values({ teacherId: teacher.id, academicClassId: cls.id, subjectId: subject.id });
  await db.insert(s.inchargeAssignments).values({ teacherId: teacher.id, academicClassId: cls.id });
  const pupils = await db.insert(s.students).values(Array.from({ length: 3 }, (_, i) => ({ portalId: i ? `PREVIEW-${i}` : 'PREVIEW-STUDENT', fullName: i ? `Preview Pupil ${i}` : student.fullName, userId: i ? null : student.id }))).returning();
  await db.insert(s.enrollments).values(pupils.map(p => ({ studentId: p.id, academicClassId: cls.id, startsOn: `${yearText}-01-01` })));
  const service = classroomService(db);
  const concurrent = await Promise.allSettled(['present', 'absent'].map(status => service.saveAttendance(teacher, cls.id, date, { version: 0, rows: pupils.map(p => ({ studentId: p.id, status })) })));
  assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1);
  const failed = concurrent.find(r => r.status === 'rejected') as PromiseRejectedResult;
  assert.equal(failed.reason.status, 409);
  const assessment = await service.createTest(teacher, cls.id, { id: randomUUID(), subjectId: subject.id, name: 'Reading comprehension', onDate: date, totalMarks: 20, description: 'Synthetic verification only' });
  await service.saveMarks(teacher, cls.id, assessment.id, { version: 0, rows: pupils.map((p, i) => ({ studentId: p.id, status: 'present', marks: 12 + i })) });
  const correction = correctionService(db); const [r] = (await correction.list(admin, { kind: 'marks', classId: cls.id, date })).records;
  const collision = await Promise.allSettled([
    service.saveMarks(teacher, cls.id, assessment.id, { version: 1, rows: [{ studentId: pupils[0].id, status: 'present', marks: 18 }] }),
    correction.save(admin, { kind: 'marks', id: r.id, version: 1, status: 'present', marks: 17, reason: 'Synthetic concurrency check' }),
  ]);
  assert.equal(collision.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((collision.find(r => r.status === 'rejected') as PromiseRejectedResult).reason.status, 409);
  await service.saveObservations(teacher, cls.id, date, 'uniform', { version: 0, rows: [{ studentId: pupils[0].id, rating: 'good', note: 'Synthetic staff-only observation' }] });
  const remarks = remarkService(db); const remark = await remarks.create(teacher, cls.id, { id: randomUUID(), studentId: pupils[0].id, onDate: date, category: 'positive_achievement', content: 'Participated well in reading practice.', parentVisible: true, studentVisible: true });
  await remarks.review(admin, remark.id, { version: 0, decision: 'approve', note: '' });
  await pool.query(readFileSync('scripts/runtime-grants.sql', 'utf8'));
  const runtime = await pool.connect();
  try {
    await runtime.query('SET ROLE tiss_runtime');
    await runtime.query('SELECT id FROM users LIMIT 1');
    await assert.rejects(runtime.query('DELETE FROM audit_logs WHERE false'), { code: '42501' });
    await assert.rejects(runtime.query('TRUNCATE audit_logs'), { code: '42501' });
    await assert.rejects(runtime.query('SELECT * FROM drizzle.__drizzle_migrations'), { code: '42501' });
    await runtime.query('BEGIN');
    await runtime.query('LOCK TABLE academic_years IN SHARE ROW EXCLUSIVE MODE');
    await runtime.query('LOCK TABLE enrollments IN SHARE MODE');
    await runtime.query('UPDATE attendance_records SET updated_at = now() WHERE false');
    await runtime.query('ROLLBACK');
  } finally { await runtime.query('RESET ROLE'); runtime.release(); }
  return { actualClassroomConcurrency: true, administratorTeacherCollision: true, restrictedRuntimePrivileges: true };
}
