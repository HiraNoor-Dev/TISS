import { and, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/types';
import * as s from '../db/schema';
import type { Principal } from './auth';
import { requireAdmin, requireClassAccess } from './permissions';
import { academicService } from './academics';
import { activeClass, audit, dateInput, schoolToday, type Store } from './academic-admin';
import { AppError } from './errors';
import { uuid } from './validation';

const fields = { category: z.enum(s.remarkCategory.enumValues), content: z.string().trim().min(1).max(3000), parentVisible: z.boolean(), studentVisible: z.boolean() };
const version = z.number().int().nonnegative();
const pageInput = z.number().int().min(1).max(10000);
const publicFields = { id: s.remarks.id, onDate: s.remarks.onDate, category: s.remarks.category, content: s.remarks.content };

export function remarkService(db: Database, today = schoolToday) {
  async function scope(store: Store, actor: Principal, classId: string) {
    uuid.parse(classId); await requireClassAccess(store, actor, classId, 'roster');
  }
  async function canReview(store: Store, actor: Principal, classId: string) {
    try { await requireClassAccess(store, actor, classId, 'contacts'); return true; }
    catch (error) { if (error instanceof AppError && error.status === 403) return false; throw error; }
  }
  async function options(actor: Principal) {
    if (actor.role === 'admin') {
      requireAdmin(actor);
      const classes = await db.select({ classId: s.academicClasses.id, year: s.academicYears.name, division: s.divisions.name, grade: s.grades.name, section: s.sections.name }).from(s.academicClasses)
        .innerJoin(s.academicYears, eq(s.academicYears.id, s.academicClasses.academicYearId)).innerJoin(s.sections, eq(s.sections.id, s.academicClasses.sectionId)).innerJoin(s.grades, eq(s.grades.id, s.sections.gradeId)).innerJoin(s.divisions, eq(s.divisions.id, s.grades.divisionId)).orderBy(desc(s.academicYears.startsOn), s.grades.name, s.sections.name);
      return { classes: classes.map(c => ({ ...c, canReview: true })), userId: actor.id, canCreate: false, today: today() };
    }
    if (actor.role !== 'teacher') throw new AppError(403, 'Staff access is required.');
    return { classes: (await academicService(db).responsibilities(actor)).map(c => ({ ...c, canReview: c.isIncharge })), userId: actor.id, canCreate: true, today: today() };
  }
  async function roster(actor: Principal, classId: string, onDate: string) {
    await scope(db, actor, classId); dateInput.parse(onDate);
    const cls = await activeClass(db, classId);
    if (onDate > today() || onDate < cls.startsOn || onDate > cls.endsOn) throw new AppError(400, 'Choose a date within the academic year, no later than today.');
    return db.select({ studentId: s.students.id, fullName: s.students.fullName, portalId: s.students.portalId }).from(s.enrollments).innerJoin(s.students, eq(s.students.id, s.enrollments.studentId))
      .where(and(eq(s.enrollments.academicClassId, classId), lte(s.enrollments.startsOn, onDate), or(isNull(s.enrollments.endsOn), gte(s.enrollments.endsOn, onDate)))).orderBy(s.students.portalId).limit(1000);
  }
  async function list(actor: Principal, classId: string, page = 1) {
    pageInput.parse(page); await scope(db, actor, classId); const reviewer = await canReview(db, actor, classId);
    const records = await db.select({ remark: s.remarks, studentName: s.students.fullName, portalId: s.students.portalId, authorName: s.users.fullName }).from(s.remarks)
      .innerJoin(s.students, eq(s.students.id, s.remarks.studentId)).innerJoin(s.users, eq(s.users.id, s.remarks.authorId))
      .where(and(eq(s.remarks.academicClassId, classId), reviewer ? undefined : eq(s.remarks.authorId, actor.id))).orderBy(desc(s.remarks.createdAt), s.remarks.id).limit(50).offset((page - 1) * 50);
    return { records, canReview: reviewer, userId: actor.id };
  }
  async function create(actor: Principal, classId: string, input: unknown) {
    const data = z.object({ ...fields, id: uuid, studentId: uuid, onDate: dateInput }).strict().parse(input); uuid.parse(classId);
    if (actor.role !== 'teacher') throw new AppError(403, 'An assigned teacher must author the remark.');
    return db.transaction(async tx => {
      await tx.execute(sql`LOCK TABLE academic_years IN SHARE MODE`); await tx.execute(sql`LOCK TABLE enrollments IN SHARE MODE`);
      await tx.select({ id: s.academicClasses.id }).from(s.academicClasses).where(eq(s.academicClasses.id, classId)).for('update');
      await scope(tx, actor, classId); const cls = await activeClass(tx, classId);
      if (data.onDate > today() || data.onDate < cls.startsOn || data.onDate > cls.endsOn) throw new AppError(400, 'Choose a date within the academic year, no later than today.');
      const [enrollment] = await tx.select({ id: s.enrollments.id }).from(s.enrollments).where(and(eq(s.enrollments.academicClassId, classId), eq(s.enrollments.studentId, data.studentId), lte(s.enrollments.startsOn, data.onDate), or(isNull(s.enrollments.endsOn), gte(s.enrollments.endsOn, data.onDate))));
      if (!enrollment) throw new AppError(400, 'Student was not enrolled in this class on the remark date.');
      const [existing] = await tx.select().from(s.remarks).where(eq(s.remarks.id, data.id));
      if (existing) {
        if (existing.authorId !== actor.id || existing.academicClassId !== classId || Object.entries(data).some(([key, value]) => existing[key as keyof typeof existing] !== value)) throw new AppError(409, 'This request ID already belongs to a different remark.');
        return existing;
      }
      const [created] = await tx.insert(s.remarks).values({ ...data, academicClassId: classId, enrollmentId: enrollment.id, authorId: actor.id, status: data.parentVisible || data.studentVisible ? 'pending' : 'internal' }).returning();
      await audit(tx, actor, 'remark.created', created.id, null, created); return created;
    });
  }
  async function locked(store: Store, actor: Principal, id: string) {
    uuid.parse(id); await store.execute(sql`LOCK TABLE academic_years IN SHARE MODE`);
    const [remark] = await store.select().from(s.remarks).where(eq(s.remarks.id, id)).for('update');
    if (!remark) throw new AppError(404, 'Remark not found.');
    await scope(store, actor, remark.academicClassId); return remark;
  }
  function unchangedVersion(actual: number, expected: number) {
    if (actual !== expected) throw new AppError(409, 'This remark changed. Reload and review the current text before continuing.');
  }
  async function edit(actor: Principal, id: string, input: unknown) {
    const data = z.object({ ...fields, version }).strict().parse(input);
    await db.transaction(async tx => {
      const before = await locked(tx, actor, id);
      if (before.authorId !== actor.id) throw new AppError(403, 'Only the author can edit remark text. Reviewers can approve, reject or withdraw visibility.');
      unchangedVersion(before.version, data.version);
      const [after] = await tx.update(s.remarks).set({ ...data, version: before.version + 1, status: data.parentVisible || data.studentVisible ? 'pending' : 'internal', approvedBy: null, approvedAt: null, reviewNote: '', updatedAt: new Date() }).where(eq(s.remarks.id, id)).returning();
      await audit(tx, actor, 'remark.edited', id, before, after);
    });
  }
  async function review(actor: Principal, id: string, input: unknown) {
    const data = z.object({ version, decision: z.enum(['approve', 'reject']), note: z.string().trim().max(500) }).strict().refine(v => v.decision !== 'reject' || v.note.length > 0, 'Explain why visibility is rejected or withdrawn.').parse(input);
    await db.transaction(async tx => {
      const before = await locked(tx, actor, id);
      if (!(await canReview(tx, actor, before.academicClassId))) throw new AppError(403, 'Only an administrator or this class incharge can review visibility.');
      unchangedVersion(before.version, data.version);
      if (before.status === 'internal' || (data.decision === 'approve' && before.status !== 'pending')) throw new AppError(400, 'Only a pending visibility request can be approved.');
      const [after] = await tx.update(s.remarks).set({ status: data.decision === 'approve' ? 'approved' : 'rejected', approvedBy: data.decision === 'approve' ? actor.id : null, approvedAt: data.decision === 'approve' ? new Date() : null, reviewNote: data.note, version: before.version + 1, updatedAt: new Date() }).where(eq(s.remarks.id, id)).returning();
      await audit(tx, actor, `remark.${data.decision === 'approve' ? 'approved' : 'visibility_rejected'}`, id, before, after);
    });
  }
  async function ownVisible(actor: Principal, page = 1) {
    pageInput.parse(page);
    if (actor.role !== 'student' || actor.mustChangePassword) throw new AppError(403, 'Student access is required.');
    return db.select(publicFields).from(s.remarks).innerJoin(s.students, eq(s.students.id, s.remarks.studentId))
      .where(and(eq(s.students.userId, actor.id), eq(s.remarks.status, 'approved'), eq(s.remarks.studentVisible, true))).orderBy(desc(s.remarks.onDate), s.remarks.id).limit(50).offset((page - 1) * 50);
  }
  // Reused by the future parent report. This returns only the approved parent projection.
  async function parentVisible(actor: Principal, classId: string, studentId: string, page = 1) {
    uuid.parse(classId); uuid.parse(studentId); pageInput.parse(page);
    await requireClassAccess(db, actor, classId, 'contacts');
    return db.select(publicFields).from(s.remarks).where(and(eq(s.remarks.academicClassId, classId), eq(s.remarks.studentId, studentId), eq(s.remarks.status, 'approved'), eq(s.remarks.parentVisible, true))).orderBy(desc(s.remarks.onDate), s.remarks.id).limit(50).offset((page - 1) * 50);
  }
  return { options, roster, list, create, edit, review, ownVisible, parentVisible };
}
