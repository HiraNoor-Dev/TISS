import { and, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Database } from '../db/types';
import type { Principal } from './auth';
import { requireClassAccess } from './permissions';
import { remarkService } from './remarks';
import { dateInput } from './academic-admin';
import { uuid } from './validation';
import { AppError } from './errors';

const queryInput = z.object({ classId: uuid, studentId: uuid.optional(), subjectId: uuid.optional(), audience: z.enum(['staff', 'parent', 'student', 'class']), from: dateInput, to: dateInput }).strict().refine(v => v.from <= v.to && (Date.parse(v.to) - Date.parse(v.from)) / 86400000 <= 550, 'Choose an ordered period of at most 551 days.');
export function reportService(db: Database) {
  async function options(actor: Principal) {
    if (actor.mustChangePassword) throw new AppError(403, 'Change your password first.');
    let classes: { classId: string; year: string; grade: string; section: string; canReview: boolean }[];
    if (actor.role === 'student') {
      classes = await db.selectDistinct({ classId: s.academicClasses.id, year: s.academicYears.name, grade: s.grades.name, section: s.sections.name, canReview: sql<boolean>`false` }).from(s.students).innerJoin(s.enrollments, eq(s.enrollments.studentId, s.students.id)).innerJoin(s.academicClasses, eq(s.academicClasses.id, s.enrollments.academicClassId)).innerJoin(s.academicYears, eq(s.academicYears.id, s.academicClasses.academicYearId)).innerJoin(s.sections, eq(s.sections.id, s.academicClasses.sectionId)).innerJoin(s.grades, eq(s.grades.id, s.sections.gradeId)).where(eq(s.students.userId, actor.id));
    } else classes = (await remarkService(db).options(actor)).classes;
    const years = await db.select({ classId: s.academicClasses.id, startsOn: s.academicYears.startsOn, endsOn: s.academicYears.endsOn }).from(s.academicClasses).innerJoin(s.academicYears, eq(s.academicYears.id, s.academicClasses.academicYearId));
    const subjects = await db.select({ id: s.subjects.id, name: s.subjects.name }).from(s.subjects).orderBy(s.subjects.name);
    return { role: actor.role, classes: classes.map(c => ({ ...c, ...years.find(y => y.classId === c.classId) })), subjects };
  }
  async function roster(actor: Principal, classId: string, from: string, to: string) {
    queryInput.parse({ classId, from, to, audience: 'staff' }); await requireClassAccess(db, actor, classId, 'roster');
    return pupils(classId, from, to);
  }
  async function pupils(classId: string, from: string, to: string, studentId?: string) {
    const rows = await db.selectDistinct({ id: s.students.id, fullName: s.students.fullName, portalId: s.students.portalId }).from(s.enrollments).innerJoin(s.students, eq(s.students.id, s.enrollments.studentId)).where(and(eq(s.enrollments.academicClassId, classId), lte(s.enrollments.startsOn, to), or(isNull(s.enrollments.endsOn), gte(s.enrollments.endsOn, from)), studentId ? eq(s.students.id, studentId) : undefined)).orderBy(s.students.portalId).limit(1001);
    if (rows.length > 1000) throw new AppError(400, 'Limit reports to classes of at most 1,000 students.'); return rows;
  }
  async function generate(actor: Principal, input: unknown) {
    const q = queryInput.parse(input); let studentId = q.studentId;
    if (actor.mustChangePassword) throw new AppError(403, 'Change your password first.');
    if (actor.role === 'student') {
      if (q.audience !== 'student' || q.studentId) throw new AppError(403, 'Students can view only their own report.');
      const [self] = await db.select({ id: s.students.id }).from(s.students).where(eq(s.students.userId, actor.id));
      if (!self) throw new AppError(404, 'Student profile not found.'); studentId = self.id;
    } else {
      if (q.audience === 'student') throw new AppError(403, 'Use staff or parent report.');
      if (q.audience === 'class') {
        try { await requireClassAccess(db, actor, q.classId, 'contacts'); }
        catch (e) { if (!(e instanceof AppError && e.status === 403)) throw e; if (!q.subjectId) throw new AppError(403, 'Choose your assigned subject.'); await requireClassAccess(db, actor, q.classId, 'marks', q.subjectId); }
      } else { await requireClassAccess(db, actor, q.classId, 'contacts'); if (!studentId) throw new AppError(400, 'Choose a student.'); }
    }
    const students = await pupils(q.classId, q.from, q.to, studentId);
    if (studentId && !students.length) throw new AppError(404, 'No enrollment in this class during the selected period.');
    const [context] = await db.select({ year: s.academicYears.name, division: s.divisions.name, grade: s.grades.name, section: s.sections.name }).from(s.academicClasses).innerJoin(s.academicYears, eq(s.academicYears.id, s.academicClasses.academicYearId)).innerJoin(s.sections, eq(s.sections.id, s.academicClasses.sectionId)).innerJoin(s.grades, eq(s.grades.id, s.sections.gradeId)).innerJoin(s.divisions, eq(s.divisions.id, s.grades.divisionId)).where(eq(s.academicClasses.id, q.classId));
    if (!context) throw new AppError(404, 'Class not found.');
    const marks = await db.select({ studentId: s.enrollments.studentId, testId: s.assessments.id, name: s.assessments.name, date: s.assessments.onDate, subject: s.subjects.name, total: s.assessments.totalMarks, marks: s.testResults.marks, status: s.testResults.status }).from(s.assessments).innerJoin(s.subjects, eq(s.subjects.id, s.assessments.subjectId)).innerJoin(s.enrollments, and(eq(s.enrollments.academicClassId, s.assessments.academicClassId), lte(s.enrollments.startsOn, s.assessments.onDate), or(isNull(s.enrollments.endsOn), gte(s.enrollments.endsOn, s.assessments.onDate)))).leftJoin(s.testResults, and(eq(s.testResults.assessmentId, s.assessments.id), eq(s.testResults.studentId, s.enrollments.studentId))).where(and(eq(s.assessments.academicClassId, q.classId), gte(s.assessments.onDate, q.from), lte(s.assessments.onDate, q.to), studentId ? eq(s.enrollments.studentId, studentId) : undefined, q.subjectId ? eq(s.assessments.subjectId, q.subjectId) : undefined)).orderBy(s.assessments.onDate, s.assessments.id, s.enrollments.studentId).limit(5001);
    if (marks.length > 5000) throw new AppError(400, 'This marks sheet is too large. Narrow the date range or select a subject.');
    const attendance = await db.select({ studentId: s.enrollments.studentId, present: sql<number>`count(*) filter (where ${s.attendanceRecords.status} = 'present')::int`, absent: sql<number>`count(*) filter (where ${s.attendanceRecords.status} = 'absent')::int`, leave: sql<number>`count(*) filter (where ${s.attendanceRecords.status} = 'leave')::int`, missing: sql<number>`count(*) filter (where ${s.attendanceRecords.id} is null)::int` }).from(s.attendanceSheets).innerJoin(s.enrollments, and(eq(s.enrollments.academicClassId, s.attendanceSheets.academicClassId), lte(s.enrollments.startsOn, s.attendanceSheets.onDate), or(isNull(s.enrollments.endsOn), gte(s.enrollments.endsOn, s.attendanceSheets.onDate)))).leftJoin(s.attendanceRecords, and(eq(s.attendanceRecords.sheetId, s.attendanceSheets.id), eq(s.attendanceRecords.studentId, s.enrollments.studentId))).where(and(eq(s.attendanceSheets.academicClassId, q.classId), gte(s.attendanceSheets.onDate, q.from), lte(s.attendanceSheets.onDate, q.to), studentId ? eq(s.enrollments.studentId, studentId) : undefined)).groupBy(s.enrollments.studentId);
    // Observation notes have no external approval flag; they remain staff-only.
    const observations = q.audience === 'staff' ? await db.select({ date: s.observationSheets.onDate, category: s.observationSheets.category, rating: s.observationRecords.rating, note: s.observationRecords.note }).from(s.observationRecords).innerJoin(s.observationSheets, eq(s.observationSheets.id, s.observationRecords.sheetId)).where(and(eq(s.observationSheets.academicClassId, q.classId), eq(s.observationRecords.studentId, studentId!), gte(s.observationSheets.onDate, q.from), lte(s.observationSheets.onDate, q.to))).orderBy(s.observationSheets.onDate, s.observationRecords.id).limit(2001) : [];
    const remarks = q.audience === 'class' ? [] : await db.select({ date: s.remarks.onDate, category: s.remarks.category, content: s.remarks.content }).from(s.remarks).where(and(eq(s.remarks.academicClassId, q.classId), eq(s.remarks.studentId, studentId!), eq(s.remarks.status, 'approved'), gte(s.remarks.onDate, q.from), lte(s.remarks.onDate, q.to), q.audience === 'parent' ? eq(s.remarks.parentVisible, true) : q.audience === 'student' ? eq(s.remarks.studentVisible, true) : undefined)).orderBy(s.remarks.onDate, s.remarks.id).limit(2001);
    if (observations.length > 2000 || remarks.length > 2000) throw new AppError(400, 'Narrow the date range to show the complete history.');
    return { context, audience: q.audience, from: q.from, to: q.to, students, marks: marks.map(m => ({ ...m, status: m.status ?? 'not_recorded', percentage: m.status === 'present' && m.marks !== null ? Math.round(m.marks / m.total * 10000) / 100 : null })), attendance: students.map(p => attendance.find(a => a.studentId === p.id) ?? { studentId: p.id, present: 0, absent: 0, leave: 0, missing: 0 }), observations, remarks };
  }
  return { options, roster, generate };
}
