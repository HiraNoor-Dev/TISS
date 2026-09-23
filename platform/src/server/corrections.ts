import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Database } from '../db/types';
import type { Principal } from './auth';
import { requireAdmin } from './permissions';
import { audit, dateInput } from './academic-admin';
import { AppError } from './errors';

const kindInput = z.enum(['marks', 'attendance', 'observations']);
const base = { id: z.uuid(), version: z.number().int().nonnegative(), reason: z.string().trim().min(5).max(500) };
const changeInput = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('marks'), status: z.enum(s.resultStatus.enumValues), marks: z.number().finite().nonnegative().max(999999.99).multipleOf(0.01).nullable() }).strict(),
  z.object({ ...base, kind: z.literal('attendance'), status: z.enum(s.attendanceStatus.enumValues) }).strict(),
  z.object({ ...base, kind: z.literal('observations'), rating: z.enum(s.observationRating.enumValues), note: z.string().trim().max(1000) }).strict(),
]);
export function correctionService(db: Database) {
  return {
    async list(actor: Principal, input: unknown) {
      requireAdmin(actor);
      const q = z.object({ kind: kindInput, classId: z.uuid(), date: dateInput, page: z.coerce.number().int().min(1).max(10000).default(1) }).strict().parse(input);
      const student = { fullName: s.students.fullName, portalId: s.students.portalId };
      const offset = (q.page - 1) * 50;
      const rows = q.kind === 'marks'
        ? await db.select({ ...student, id: s.testResults.id, version: s.assessments.version, label: s.assessments.name, status: s.testResults.status, marks: s.testResults.marks, total: s.assessments.totalMarks }).from(s.testResults).innerJoin(s.students, eq(s.students.id, s.testResults.studentId)).innerJoin(s.assessments, eq(s.assessments.id, s.testResults.assessmentId)).where(and(eq(s.assessments.academicClassId, q.classId), eq(s.assessments.onDate, q.date))).orderBy(s.students.portalId, s.assessments.id).limit(51).offset(offset)
        : q.kind === 'attendance'
          ? await db.select({ ...student, id: s.attendanceRecords.id, version: s.attendanceSheets.version, label: s.attendanceSheets.onDate, status: s.attendanceRecords.status }).from(s.attendanceRecords).innerJoin(s.students, eq(s.students.id, s.attendanceRecords.studentId)).innerJoin(s.attendanceSheets, eq(s.attendanceSheets.id, s.attendanceRecords.sheetId)).where(and(eq(s.attendanceSheets.academicClassId, q.classId), eq(s.attendanceSheets.onDate, q.date))).orderBy(s.students.portalId).limit(51).offset(offset)
          : await db.select({ ...student, id: s.observationRecords.id, version: s.observationSheets.version, label: s.observationSheets.category, author: s.users.fullName, rating: s.observationRecords.rating, note: s.observationRecords.note }).from(s.observationRecords).innerJoin(s.students, eq(s.students.id, s.observationRecords.studentId)).innerJoin(s.observationSheets, eq(s.observationSheets.id, s.observationRecords.sheetId)).innerJoin(s.users, eq(s.users.id, s.observationSheets.authorId)).where(and(eq(s.observationSheets.academicClassId, q.classId), eq(s.observationSheets.onDate, q.date))).orderBy(s.students.portalId, desc(s.observationSheets.id)).limit(51).offset(offset);
      return { records: rows.slice(0, 50), hasMore: rows.length > 50 };
    },
    async save(actor: Principal, input: unknown) {
      requireAdmin(actor); const data = changeInput.parse(input);
      return db.transaction(async tx => {
        // Same lock order as teacher saves and configuration changes.
        await tx.execute(sql`LOCK TABLE academic_years IN SHARE MODE`);
        await tx.execute(sql`LOCK TABLE enrollments IN SHARE MODE`);
        const recordTable = data.kind === 'marks' ? s.testResults : data.kind === 'attendance' ? s.attendanceRecords : s.observationRecords;
        const sheetTable = data.kind === 'marks' ? s.assessments : data.kind === 'attendance' ? s.attendanceSheets : s.observationSheets;
        const sheetKey = data.kind === 'marks' ? s.testResults.assessmentId : data.kind === 'attendance' ? s.attendanceRecords.sheetId : s.observationRecords.sheetId;
        const [context] = await tx.select({ classId: sheetTable.academicClassId, sheetId: sheetTable.id }).from(recordTable).innerJoin(sheetTable, eq(sheetTable.id, sheetKey)).where(eq(recordTable.id, data.id));
        if (!context) throw new AppError(404, 'Record not found.');
        await tx.select({ id: s.academicClasses.id }).from(s.academicClasses).where(eq(s.academicClasses.id, context.classId)).for('update');
        const [sheet] = await tx.select({ version: sheetTable.version }).from(sheetTable).where(eq(sheetTable.id, context.sheetId));
        if (sheet.version !== data.version) throw new AppError(409, 'This sheet changed. Reload and review before correcting it.');
        const [before] = await tx.select().from(recordTable).where(eq(recordTable.id, data.id));
        if (!before) throw new AppError(404, 'Record not found.');
        let after: unknown;
        if (data.kind === 'marks') {
          const [test] = await tx.select({ total: s.assessments.totalMarks }).from(s.assessments).where(eq(s.assessments.id, context.sheetId));
          if (data.status === 'present' ? data.marks === null || data.marks > test.total : data.marks !== null) throw new AppError(400, 'Present results require marks within the test total; other statuses require blank marks.');
          [after] = await tx.update(s.testResults).set({ status: data.status, marks: data.marks, updatedBy: actor.id, updatedAt: new Date() }).where(eq(s.testResults.id, data.id)).returning();
        } else if (data.kind === 'attendance') {
          [after] = await tx.update(s.attendanceRecords).set({ status: data.status, updatedBy: actor.id, updatedAt: new Date() }).where(eq(s.attendanceRecords.id, data.id)).returning();
        } else {
          [after] = await tx.update(s.observationRecords).set({ rating: data.rating, note: data.note, updatedAt: new Date() }).where(eq(s.observationRecords.id, data.id)).returning();
        }
        await tx.update(sheetTable).set({ version: sheet.version + 1 }).where(eq(sheetTable.id, context.sheetId));
        await audit(tx, actor, `${data.kind}.corrected`, data.id, before, { record: after, reason: data.reason });
        return { version: sheet.version + 1 };
      });
    },
  };
}
