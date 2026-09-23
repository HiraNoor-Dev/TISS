import { and, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/types';
import * as s from '../db/schema';
import type { Principal } from './auth';
import { requireClassAccess } from './permissions';
import { academicService } from './academics';
import { activeClass, audit, dateInput, schoolToday, type Store } from './academic-admin';
import { AppError } from './errors';
import { uuid } from './validation';

const points = z.number().finite().min(0).max(999999.99).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.000001, 'Use at most two decimal places.');
const revision = z.number().int().nonnegative();
export const categoryInput = z.enum(s.observationCategory.enumValues);
const resultInput = z.object({ studentId: uuid, status: z.enum(s.resultStatus.enumValues), marks: points.nullable() }).strict().refine(r => r.status === 'present' ? r.marks !== null : r.marks === null, 'Present results need marks; other statuses must not have marks.');
const attendanceInput = z.object({ studentId: uuid, status: z.enum(s.attendanceStatus.enumValues) }).strict();
const observationInput = z.object({ studentId: uuid, rating: z.enum(s.observationRating.enumValues), note: z.string().trim().max(1000) }).strict();
const bulk = <T extends z.ZodType>(row: T) => z.object({ version: revision, rows: z.array(row).min(1).max(1000) }).strict();

export function classroomService(db: Database, today = schoolToday) {
  async function allowed(store: Store, actor: Principal, classId: string, subjectId?: string) {
    uuid.parse(classId); if (subjectId) uuid.parse(subjectId);
    if (actor.role !== 'teacher') throw new AppError(403, 'An assigned teacher is required for classroom entry.');
    await requireClassAccess(store, actor, classId, subjectId ? 'marks' : 'roster', subjectId);
  }
  async function context(store: Store, actor: Principal, classId: string, onDate: string, subjectId?: string) {
    await allowed(store, actor, classId, subjectId); dateInput.parse(onDate);
    const cls = await activeClass(store, classId);
    if (onDate < cls.startsOn || onDate > cls.endsOn || onDate > today()) throw new AppError(400, 'Choose a date within this academic year, no later than today.');
  }
  async function lock(store: Store, classId: string) {
    // Coordinate with configuration changes and enrollment writes before checking scope.
    await store.execute(sql`LOCK TABLE academic_years IN SHARE MODE`);
    await store.execute(sql`LOCK TABLE enrollments IN SHARE MODE`);
    await store.select({ id: s.academicClasses.id }).from(s.academicClasses).where(eq(s.academicClasses.id, classId)).for('update');
  }
  async function roster(store: Store, classId: string, onDate: string) {
    // Dated enrollment, not today's student status, determines a historical roster.
    const rows = await store.select({ studentId: s.students.id, enrollmentId: s.enrollments.id, fullName: s.students.fullName, portalId: s.students.portalId }).from(s.enrollments).innerJoin(s.students, eq(s.students.id, s.enrollments.studentId))
      .where(and(eq(s.enrollments.academicClassId, classId), lte(s.enrollments.startsOn, onDate), or(isNull(s.enrollments.endsOn), gte(s.enrollments.endsOn, onDate)))).orderBy(s.students.portalId).limit(1001);
    if (rows.length > 1000) throw new AppError(400, 'This class exceeds the supported bulk roster size of 1,000 students.');
    return rows;
  }
  function validateRows(rows: { studentId: string }[], pupils: Awaited<ReturnType<typeof roster>>) {
    if (new Set(rows.map(r => r.studentId)).size !== rows.length) throw new AppError(400, 'Each student can appear only once.');
    const map = new Map(pupils.map(p => [p.studentId, p.enrollmentId]));
    if (rows.some(r => !map.has(r.studentId))) throw new AppError(400, 'A student is not enrolled in this class on the selected date. Reload the roster.');
    return map;
  }
  function checkVersion(expected: number, actual: number) {
    if (expected !== actual) throw new AppError(409, 'Someone changed this sheet. Reload it and review the latest entries before saving again.');
  }
  async function workspace(actor: Principal, classId: string) {
    await allowed(db, actor, classId);
    const responsibilities = await academicService(db).responsibilities(actor);
    const cls = responsibilities.find(c => c.classId === classId);
    if (!cls) throw new AppError(403, 'This class is outside your responsibilities.');
    const dates = await activeClass(db, classId);
    return { ...cls, startsOn: dates.startsOn, endsOn: dates.endsOn, today: today() };
  }
  async function tests(actor: Principal, classId: string, subjectId: string, page = 1) {
    await allowed(db, actor, classId, subjectId);
    return db.select().from(s.assessments).where(and(eq(s.assessments.academicClassId, classId), eq(s.assessments.subjectId, subjectId))).orderBy(desc(s.assessments.onDate), s.assessments.id).limit(50).offset((page - 1) * 50);
  }
  async function createTest(actor: Principal, classId: string, input: unknown) {
    const data = z.object({ id: uuid, subjectId: uuid, name: z.string().trim().min(1).max(120), onDate: dateInput, totalMarks: points.refine(n => n > 0, 'Total marks must be greater than zero.'), description: z.string().trim().max(1000) }).strict().parse(input);
    uuid.parse(classId);
    return db.transaction(async tx => {
      await lock(tx, classId); await context(tx, actor, classId, data.onDate, data.subjectId);
      const values = { ...data, academicClassId: classId, authorId: actor.id };
      const [existing] = await tx.select().from(s.assessments).where(eq(s.assessments.id, data.id));
      if (existing) {
        if (Object.entries(values).some(([key, value]) => existing[key as keyof typeof existing] !== value)) throw new AppError(409, 'This request ID was already used for another test.');
        return existing;
      }
      const [created] = await tx.insert(s.assessments).values(values).returning();
      await audit(tx, actor, 'assessment.created', created.id, null, created); return created;
    });
  }
  async function testContext(store: Store, actor: Principal, classId: string, testId: string) {
    uuid.parse(testId); uuid.parse(classId);
    const [test] = await store.select().from(s.assessments).where(and(eq(s.assessments.id, testId), eq(s.assessments.academicClassId, classId)));
    if (!test) throw new AppError(404, 'Test not found in this class.');
    await context(store, actor, classId, test.onDate, test.subjectId); return test;
  }
  async function marks(actor: Principal, classId: string, testId: string) {
    const test = await testContext(db, actor, classId, testId);
    return { test, roster: await roster(db, classId, test.onDate), records: await db.select().from(s.testResults).where(eq(s.testResults.assessmentId, test.id)) };
  }
  async function saveMarks(actor: Principal, classId: string, testId: string, input: unknown) {
    const data = bulk(resultInput).parse(input); uuid.parse(classId);
    return db.transaction(async tx => {
      await lock(tx, classId); const test = await testContext(tx, actor, classId, testId); checkVersion(data.version, test.version);
      const pupils = validateRows(data.rows, await roster(tx, classId, test.onDate));
      if (data.rows.some(r => r.marks !== null && r.marks > test.totalMarks)) throw new AppError(400, 'Obtained marks cannot exceed total marks.');
      const old = await tx.select().from(s.testResults).where(eq(s.testResults.assessmentId, testId));
      for (const row of data.rows) {
        const before = old.find(r => r.studentId === row.studentId);
        if (before && before.status === row.status && before.marks === row.marks) continue;
        const values = { ...row, assessmentId: testId, enrollmentId: pupils.get(row.studentId)!, updatedBy: actor.id, updatedAt: new Date() };
        const [after] = await tx.insert(s.testResults).values(values).onConflictDoUpdate({ target: [s.testResults.assessmentId, s.testResults.studentId], set: values }).returning();
        await audit(tx, actor, 'result.saved', after.id, before ?? null, after);
      }
      await tx.update(s.assessments).set({ version: test.version + 1 }).where(eq(s.assessments.id, testId));
      return { version: test.version + 1 };
    });
  }
  async function attendance(actor: Principal, classId: string, onDate: string) {
    await context(db, actor, classId, onDate);
    const [sheet] = await db.select().from(s.attendanceSheets).where(and(eq(s.attendanceSheets.academicClassId, classId), eq(s.attendanceSheets.onDate, onDate)));
    return { version: sheet?.version ?? 0, roster: await roster(db, classId, onDate), records: sheet ? await db.select().from(s.attendanceRecords).where(eq(s.attendanceRecords.sheetId, sheet.id)) : [] };
  }
  async function saveAttendance(actor: Principal, classId: string, onDate: string, input: unknown) {
    const data = bulk(attendanceInput).parse(input); uuid.parse(classId);
    return db.transaction(async tx => {
      await lock(tx, classId); await context(tx, actor, classId, onDate);
      const pupils = validateRows(data.rows, await roster(tx, classId, onDate));
      let [sheet] = await tx.select().from(s.attendanceSheets).where(and(eq(s.attendanceSheets.academicClassId, classId), eq(s.attendanceSheets.onDate, onDate)));
      checkVersion(data.version, sheet?.version ?? 0);
      if (!sheet) [sheet] = await tx.insert(s.attendanceSheets).values({ academicClassId: classId, onDate, authorId: actor.id }).returning();
      const old = await tx.select().from(s.attendanceRecords).where(eq(s.attendanceRecords.sheetId, sheet.id));
      for (const row of data.rows) {
        const before = old.find(r => r.studentId === row.studentId); if (before?.status === row.status) continue;
        const values = { ...row, sheetId: sheet.id, enrollmentId: pupils.get(row.studentId)!, updatedBy: actor.id, updatedAt: new Date() };
        const [after] = await tx.insert(s.attendanceRecords).values(values).onConflictDoUpdate({ target: [s.attendanceRecords.sheetId, s.attendanceRecords.studentId], set: values }).returning();
        await audit(tx, actor, 'attendance.saved', after.id, before ?? null, after);
      }
      await tx.update(s.attendanceSheets).set({ version: sheet.version + 1 }).where(eq(s.attendanceSheets.id, sheet.id)); return { version: sheet.version + 1 };
    });
  }
  async function observations(actor: Principal, classId: string, onDate: string, category: string) {
    const checked = categoryInput.parse(category); await context(db, actor, classId, onDate);
    const [sheet] = await db.select().from(s.observationSheets).where(and(eq(s.observationSheets.academicClassId, classId), eq(s.observationSheets.onDate, onDate), eq(s.observationSheets.category, checked), eq(s.observationSheets.authorId, actor.id)));
    return { version: sheet?.version ?? 0, roster: await roster(db, classId, onDate), records: sheet ? await db.select().from(s.observationRecords).where(eq(s.observationRecords.sheetId, sheet.id)) : [] };
  }
  async function saveObservations(actor: Principal, classId: string, onDate: string, category: string, input: unknown) {
    const checked = categoryInput.parse(category); const data = bulk(observationInput).parse(input); uuid.parse(classId);
    return db.transaction(async tx => {
      await lock(tx, classId); await context(tx, actor, classId, onDate);
      const pupils = validateRows(data.rows, await roster(tx, classId, onDate));
      let [sheet] = await tx.select().from(s.observationSheets).where(and(eq(s.observationSheets.academicClassId, classId), eq(s.observationSheets.onDate, onDate), eq(s.observationSheets.category, checked), eq(s.observationSheets.authorId, actor.id)));
      checkVersion(data.version, sheet?.version ?? 0);
      if (!sheet) [sheet] = await tx.insert(s.observationSheets).values({ academicClassId: classId, onDate, category: checked, authorId: actor.id }).returning();
      const old = await tx.select().from(s.observationRecords).where(eq(s.observationRecords.sheetId, sheet.id));
      for (const row of data.rows) {
        const before = old.find(r => r.studentId === row.studentId); if (before && before.rating === row.rating && before.note === row.note) continue;
        const values = { ...row, sheetId: sheet.id, enrollmentId: pupils.get(row.studentId)!, updatedAt: new Date() };
        const [after] = await tx.insert(s.observationRecords).values(values).onConflictDoUpdate({ target: [s.observationRecords.sheetId, s.observationRecords.studentId], set: values }).returning();
        await audit(tx, actor, 'observation.saved', after.id, before ?? null, { ...after, authorId: actor.id, category: checked, onDate });
      }
      await tx.update(s.observationSheets).set({ version: sheet.version + 1 }).where(eq(s.observationSheets.id, sheet.id)); return { version: sheet.version + 1 };
    });
  }
  return { workspace, tests, createTest, marks, saveMarks, attendance, saveAttendance, observations, saveObservations };
}
