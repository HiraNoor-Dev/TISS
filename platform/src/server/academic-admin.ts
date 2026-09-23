import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/types';
import * as s from '../db/schema';
import type { Principal } from './auth';
import { requireAdmin } from './permissions';
import { AppError } from './errors';
import { uuid } from './validation';

export type Store = Pick<Database, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;
const name = z.string().trim().min(1).max(100);
export const dateInput = z.iso.date();
export const structureKind = z.enum(['years', 'divisions', 'grades', 'sections', 'classes', 'subjects']);
export type StructureKind = z.infer<typeof structureKind>;
const tables = { years: s.academicYears, divisions: s.divisions, grades: s.grades, sections: s.sections, classes: s.academicClasses, subjects: s.subjects };
const inputs = {
  years: z.object({ name, startsOn: dateInput, endsOn: dateInput }).strict().refine(v => v.endsOn >= v.startsOn, 'End date must be on or after the start date.'),
  divisions: z.object({ name }).strict(),
  grades: z.object({ name, divisionId: uuid }).strict(),
  sections: z.object({ name, gradeId: uuid }).strict(),
  classes: z.object({ academicYearId: uuid, sectionId: uuid }).strict(),
  subjects: z.object({ name, code: z.string().trim().toUpperCase().min(1).max(24).regex(/^[A-Z0-9_-]+$/) }).strict(),
};
export const schoolToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());

export async function activeClass(db: Store, classId: string) {
  const [context] = await db.select({ id: s.academicClasses.id, startsOn: s.academicYears.startsOn, endsOn: s.academicYears.endsOn, isCurrent: s.academicYears.isCurrent }).from(s.academicClasses)
    .innerJoin(s.academicYears, eq(s.academicYears.id, s.academicClasses.academicYearId))
    .innerJoin(s.sections, eq(s.sections.id, s.academicClasses.sectionId))
    .innerJoin(s.grades, eq(s.grades.id, s.sections.gradeId)).innerJoin(s.divisions, eq(s.divisions.id, s.grades.divisionId))
    .where(and(eq(s.academicClasses.id, classId), eq(s.academicClasses.isActive, true), eq(s.academicYears.isActive, true), eq(s.sections.isActive, true), eq(s.grades.isActive, true), eq(s.divisions.isActive, true))).limit(1);
  if (!context) throw new AppError(400, 'Choose an active class with an active year, division, grade and section.');
  return context;
}
export async function audit(db: Store, actor: Principal, action: string, entityId: string, before: unknown = null, after: unknown = null) {
  await db.insert(s.auditLogs).values({ actorId: actor.id, action, entityId, before, after });
}

export function academicAdminService(db: Database) {
  async function overview(actor: Principal) {
    requireAdmin(actor);
    const [years, divisions, grades, sections, classes, subjects, teachers, teaching, incharges] = await Promise.all([
      db.select().from(s.academicYears).orderBy(s.academicYears.startsOn), db.select().from(s.divisions).orderBy(s.divisions.name),
      db.select().from(s.grades).orderBy(s.grades.name), db.select().from(s.sections).orderBy(s.sections.name),
      db.select().from(s.academicClasses), db.select().from(s.subjects).orderBy(s.subjects.name),
      db.select({ id: s.users.id, fullName: s.users.fullName, username: s.users.username, status: s.users.status }).from(s.teachers).innerJoin(s.users, eq(s.users.id, s.teachers.userId)).orderBy(s.users.fullName),
      db.select().from(s.teachingAssignments),
      db.select().from(s.inchargeAssignments),
    ]);
    return { years, divisions, grades, sections, classes, subjects, teachers, teaching, incharges };
  }
  async function create(actor: Principal, kind: StructureKind, input: unknown) {
    requireAdmin(actor); structureKind.parse(kind);
    const data = inputs[kind].parse(input);
    return db.transaction(async tx => {
      // Serialize configuration mutations, including selecting the single current year.
      await tx.execute(sql`LOCK TABLE academic_years IN SHARE ROW EXCLUSIVE MODE`);
      if ('divisionId' in data) {
        const [parent] = await tx.select().from(s.divisions).where(and(eq(s.divisions.id, uuid.parse(data.divisionId)), eq(s.divisions.isActive, true)));
        if (!parent) throw new AppError(400, 'Choose an active division.');
      }
      if ('gradeId' in data) {
        const [parent] = await tx.select({ id: s.grades.id }).from(s.grades).innerJoin(s.divisions, eq(s.divisions.id, s.grades.divisionId)).where(and(eq(s.grades.id, uuid.parse(data.gradeId)), eq(s.grades.isActive, true), eq(s.divisions.isActive, true)));
        if (!parent) throw new AppError(400, 'Choose an active grade and division.');
      }
      if ('academicYearId' in data) {
        const [year] = await tx.select().from(s.academicYears).where(and(eq(s.academicYears.id, data.academicYearId), eq(s.academicYears.isActive, true)));
        const [section] = await tx.select({ id: s.sections.id }).from(s.sections).innerJoin(s.grades, eq(s.grades.id, s.sections.gradeId)).innerJoin(s.divisions, eq(s.divisions.id, s.grades.divisionId)).where(and(eq(s.sections.id, data.sectionId), eq(s.sections.isActive, true), eq(s.grades.isActive, true), eq(s.divisions.isActive, true)));
        if (!year || !section) throw new AppError(400, 'Choose an active year and section hierarchy.');
      }
      // Narrow each entity so its required columns stay checked by TypeScript.
      let created;
      switch (kind) {
        case 'years': [created] = await tx.insert(s.academicYears).values(inputs.years.parse(input)).returning(); break;
        case 'divisions': [created] = await tx.insert(s.divisions).values(inputs.divisions.parse(input)).returning(); break;
        case 'grades': [created] = await tx.insert(s.grades).values(inputs.grades.parse(input)).returning(); break;
        case 'sections': [created] = await tx.insert(s.sections).values(inputs.sections.parse(input)).returning(); break;
        case 'classes': [created] = await tx.insert(s.academicClasses).values(inputs.classes.parse(input)).returning(); break;
        case 'subjects': [created] = await tx.insert(s.subjects).values(inputs.subjects.parse(input)).returning(); break;
      }
      await audit(tx, actor, `academic.${kind}.created`, created.id, null, created);
      return created;
    });
  }
  async function setActive(actor: Principal, kind: StructureKind, id: string, input: unknown) {
    requireAdmin(actor); structureKind.parse(kind); uuid.parse(id);
    const { isActive } = z.object({ isActive: z.boolean() }).strict().parse(input);
    return db.transaction(async tx => {
      await tx.execute(sql`LOCK TABLE academic_years IN SHARE ROW EXCLUSIVE MODE`);
      const table = tables[kind];
      const [old] = await tx.select().from(table).where(eq(table.id, id));
      if (!old) throw new AppError(404, 'Configuration record not found.');
      if ('isCurrent' in old && old.isCurrent && !isActive) throw new AppError(400, 'Select another current year before deactivating this year.');
      await tx.update(table).set({ isActive }).where(eq(table.id, id));
      await audit(tx, actor, `academic.${kind}.status_changed`, id, { isActive: old.isActive }, { isActive });
    });
  }
  async function setCurrentYear(actor: Principal, id: string) {
    requireAdmin(actor); uuid.parse(id);
    await db.transaction(async tx => {
      await tx.execute(sql`LOCK TABLE academic_years IN SHARE ROW EXCLUSIVE MODE`);
      const [year] = await tx.select().from(s.academicYears).where(eq(s.academicYears.id, id));
      if (!year?.isActive) throw new AppError(400, 'Choose an active academic year.');
      const [previous] = await tx.select({ id: s.academicYears.id }).from(s.academicYears).where(eq(s.academicYears.isCurrent, true));
      await tx.update(s.academicYears).set({ isCurrent: false }).where(eq(s.academicYears.isCurrent, true));
      await tx.update(s.academicYears).set({ isCurrent: true }).where(eq(s.academicYears.id, id));
      await audit(tx, actor, 'academic.current_year_changed', id, { yearId: previous?.id ?? null }, { yearId: id });
    });
  }
  async function assign(actor: Principal, kind: 'teaching' | 'incharge', input: unknown) {
    requireAdmin(actor);
    const data = kind === 'teaching'
      ? z.object({ teacherId: uuid, academicClassId: uuid, subjectId: uuid }).strict().parse(input)
      : z.object({ teacherId: uuid, academicClassId: uuid }).strict().parse(input);
    return db.transaction(async tx => {
      await tx.execute(sql`LOCK TABLE academic_years IN SHARE ROW EXCLUSIVE MODE`);
      await activeClass(tx, data.academicClassId);
      const [teacher] = await tx.select({ id: s.users.id }).from(s.users).innerJoin(s.teachers, eq(s.teachers.userId, s.users.id)).where(and(eq(s.users.id, data.teacherId), eq(s.users.status, 'active'), eq(s.users.role, 'teacher'))).for('share');
      if (!teacher) throw new AppError(400, 'Choose an active teacher account.');
      let assignment;
      if ('subjectId' in data) {
        const subjectId = uuid.parse(data.subjectId);
        const [subject] = await tx.select().from(s.subjects).where(and(eq(s.subjects.id, subjectId), eq(s.subjects.isActive, true)));
        if (!subject) throw new AppError(400, 'Choose an active subject.');
        [assignment] = await tx.insert(s.teachingAssignments).values({ ...data, subjectId }).returning();
      } else {
        [assignment] = await tx.insert(s.inchargeAssignments).values(data).returning();
      }
      await audit(tx, actor, `assignment.${kind}.created`, assignment.id, null, assignment);
      return assignment;
    });
  }
  async function revoke(actor: Principal, kind: 'teaching' | 'incharge', id: string) {
    requireAdmin(actor); uuid.parse(id);
    await db.transaction(async tx => {
      await tx.execute(sql`LOCK TABLE academic_years IN SHARE ROW EXCLUSIVE MODE`);
      const table = kind === 'teaching' ? s.teachingAssignments : s.inchargeAssignments;
      const [old] = await tx.select().from(table).where(and(eq(table.id, id), isNull(table.revokedAt)));
      if (!old) throw new AppError(404, 'Active assignment not found.');
      await tx.update(table).set({ revokedAt: new Date() }).where(eq(table.id, id));
      await audit(tx, actor, `assignment.${kind}.revoked`, id, old, { revoked: true });
    });
  }
  async function edit(actor: Principal, kind: StructureKind, id: string, input: unknown) {
    requireAdmin(actor); structureKind.parse(kind); uuid.parse(id);
    if (kind === 'classes') throw new AppError(400, 'Correct the grade or section name instead. Delete and recreate an unused class to change its year or section.');
    const data = kind === 'subjects' ? inputs.subjects.parse(input) : z.object({ name }).strict().parse(input);
    await db.transaction(async tx => {
      await tx.execute(sql`LOCK TABLE academic_years IN SHARE ROW EXCLUSIVE MODE`);
      const table = tables[kind]; const [before] = await tx.select().from(table).where(eq(table.id, id));
      if (!before) throw new AppError(404, 'Configuration record not found.');
      await tx.update(table).set(data).where(eq(table.id, id));
      await audit(tx, actor, `academic.${kind}.edited`, id, before, data);
    });
  }
  async function remove(actor: Principal, kind: StructureKind, id: string) {
    requireAdmin(actor); structureKind.parse(kind); uuid.parse(id);
    try {
      await db.transaction(async tx => {
        await tx.execute(sql`LOCK TABLE academic_years IN SHARE ROW EXCLUSIVE MODE`);
        const table = tables[kind]; const [before] = await tx.select().from(table).where(eq(table.id, id));
        if (!before) throw new AppError(404, 'Configuration record not found.');
        if ('isCurrent' in before && before.isCurrent) throw new AppError(409, 'Select another current year before deleting this year.');
        // Restrictive foreign keys protect active AND historical dependents; never cascade.
        await tx.delete(table).where(eq(table.id, id));
        await audit(tx, actor, `academic.${kind}.deleted`, id, before, null);
      });
    } catch (error) { deletionConflict(error); }
  }
  async function removeAssignment(actor: Principal, kind: 'teaching' | 'incharge', id: string) {
    requireAdmin(actor); uuid.parse(id);
    await db.transaction(async tx => {
      await tx.execute(sql`LOCK TABLE academic_years IN SHARE ROW EXCLUSIVE MODE`);
      const table = kind === 'teaching' ? s.teachingAssignments : s.inchargeAssignments;
      const [before] = await tx.select().from(table).where(eq(table.id, id));
      if (!before) throw new AppError(404, 'Assignment not found.');
      // Records predate assignment IDs in this schema, so retain any assignment for a used class.
      const [used] = await tx.execute(sql`SELECT 1 FROM enrollments WHERE academic_class_id = ${before.academicClassId}
        UNION ALL SELECT 1 FROM assessments WHERE academic_class_id = ${before.academicClassId}
        UNION ALL SELECT 1 FROM attendance_sheets WHERE academic_class_id = ${before.academicClassId}
        UNION ALL SELECT 1 FROM observation_sheets WHERE academic_class_id = ${before.academicClassId} LIMIT 1`).then(r => r.rows);
      if (used) throw new AppError(409, 'This class has student or classroom history. Revoke the assignment instead.');
      await tx.delete(table).where(eq(table.id, id));
      await audit(tx, actor, `assignment.${kind}.deleted`, id, before, null);
    });
  }
  return { overview, create, setActive, setCurrentYear, assign, revoke, edit, remove, removeAssignment };
}

export function deletionConflict(error: unknown): never {
  const dbError = error as { code?: string; cause?: { code?: string } };
  if (['23503', '23001'].includes(dbError.code ?? dbError.cause?.code ?? '')) throw new AppError(409, 'This record has linked records or history. Remove unused dependencies first, or deactivate it instead.');
  throw error;
}
