import { and, desc, eq, gte, ilike, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/types';
import * as s from '../db/schema';
import type { Principal } from './auth';
import { requireAdmin, requireClassAccess } from './permissions';
import { AppError } from './errors';
import { uuid } from './validation';
import { activeClass, audit, dateInput, schoolToday, type Store } from './academic-admin';

const fullName = z.string().trim().min(1).max(120);
const phone = z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Use an international number such as +923001234567.');
const guardianFields = z.object({ fullName, phone, whatsapp: z.union([phone, z.literal('')]).transform(v => v || null), whatsappConsent: z.boolean(), relationship: z.string().trim().min(1).max(60), isPrimary: z.boolean() }).strict().refine(v => !v.whatsappConsent || Boolean(v.whatsapp), { path: ['whatsappConsent'], message: 'Enter a WhatsApp number before recording consent.' });
const linkGuardianFields = z.object({ guardianId: uuid, relationship: z.string().trim().min(1).max(60), isPrimary: z.boolean() }).strict();
const profileFields = { id: s.students.id, portalId: s.students.portalId, fullName: s.students.fullName, status: s.students.status, userId: s.students.userId };
const dayBefore = (date: string) => new Date(new Date(`${date}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
const literalSearch = (text: string) => `%${text.replace(/[\\%_]/g, '\\$&')}%`;

export function studentManagementService(db: Database, today = schoolToday) {
  async function scope(store: Store, actor: Principal, classId?: string) {
    if (actor.role === 'admin') { requireAdmin(actor); return; }
    if (actor.role !== 'teacher' || !classId) throw new AppError(403, 'Administrator or assigned class-incharge access is required.');
    uuid.parse(classId); await requireClassAccess(store, actor, classId, 'contacts');
  }
  async function managedStudent(store: Store, actor: Principal, id: string, classId?: string, lock = false) {
    uuid.parse(id); await scope(store, actor, classId);
    const query = store.select(profileFields).from(s.students).where(eq(s.students.id, id));
    const [student] = await (lock ? query.for('update') : query);
    if (!student) throw new AppError(404, 'Student not found.');
    if (actor.role !== 'admin') {
      const [enrollment] = await store.select({ id: s.enrollments.id }).from(s.enrollments).where(and(eq(s.enrollments.studentId, id), eq(s.enrollments.academicClassId, classId!), lte(s.enrollments.startsOn, today()), or(isNull(s.enrollments.endsOn), gte(s.enrollments.endsOn, today()))));
      if (!enrollment) throw new AppError(403, 'This student is outside your incharge class.');
    }
    return student;
  }
  async function classOptions(actor: Principal) {
    if (actor.mustChangePassword || !['teacher', 'admin'].includes(actor.role)) throw new AppError(403, 'Staff access is required.');
    const classes = await db.select({ id: s.academicClasses.id, year: s.academicYears.name, isCurrent: s.academicYears.isCurrent, startsOn: s.academicYears.startsOn, endsOn: s.academicYears.endsOn, division: s.divisions.name, grade: s.grades.name, section: s.sections.name }).from(s.academicClasses)
      .innerJoin(s.academicYears, eq(s.academicYears.id, s.academicClasses.academicYearId)).innerJoin(s.sections, eq(s.sections.id, s.academicClasses.sectionId)).innerJoin(s.grades, eq(s.grades.id, s.sections.gradeId)).innerJoin(s.divisions, eq(s.divisions.id, s.grades.divisionId))
      .where(and(eq(s.academicClasses.isActive, true), eq(s.academicYears.isActive, true), eq(s.sections.isActive, true), eq(s.grades.isActive, true), eq(s.divisions.isActive, true))).orderBy(s.academicYears.startsOn, s.grades.name, s.sections.name);
    if (actor.role === 'admin') return classes;
    const assigned = await db.select({ classId: s.inchargeAssignments.academicClassId }).from(s.inchargeAssignments).where(and(eq(s.inchargeAssignments.teacherId, actor.id), isNull(s.inchargeAssignments.revokedAt)));
    return classes.filter(c => c.isCurrent && assigned.some(a => a.classId === c.id));
  }
  async function list(actor: Principal, options: { classId?: string; page: number; query: string }) {
    await scope(db, actor, options.classId);
    if (options.classId) uuid.parse(options.classId);
    const text = z.string().trim().max(100).parse(options.query);
    const enrollmentMatch = options.classId ? sql`EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = ${s.students.id} AND e.academic_class_id = ${options.classId} AND e.starts_on <= ${today()}::date AND (e.ends_on IS NULL OR e.ends_on >= ${today()}::date))` : undefined;
    return db.select(profileFields).from(s.students).where(and(enrollmentMatch, text ? or(ilike(s.students.fullName, literalSearch(text)), ilike(s.students.portalId, literalSearch(text))) : undefined)).orderBy(s.students.portalId).limit(50).offset((options.page - 1) * 50);
  }
  async function details(actor: Principal, id: string, classId?: string) {
    const student = await managedStudent(db, actor, id, classId);
    const [history, guardians] = await Promise.all([
      db.select({ id: s.enrollments.id, academicClassId: s.enrollments.academicClassId, startsOn: s.enrollments.startsOn, endsOn: s.enrollments.endsOn, year: s.academicYears.name, yearEndsOn: s.academicYears.endsOn, grade: s.grades.name, section: s.sections.name }).from(s.enrollments)
        .innerJoin(s.academicClasses, eq(s.academicClasses.id, s.enrollments.academicClassId)).innerJoin(s.academicYears, eq(s.academicYears.id, s.academicClasses.academicYearId)).innerJoin(s.sections, eq(s.sections.id, s.academicClasses.sectionId)).innerJoin(s.grades, eq(s.grades.id, s.sections.gradeId))
        .where(eq(s.enrollments.studentId, id)).orderBy(desc(s.enrollments.startsOn)),
      db.select({ linkId: s.studentGuardians.id, guardianId: s.guardians.id, fullName: s.guardians.fullName, phone: s.guardians.phone, whatsapp: s.guardians.whatsapp, whatsappOptInAt: s.guardians.whatsappOptInAt, relationship: s.studentGuardians.relationship, isPrimary: s.studentGuardians.isPrimary }).from(s.studentGuardians).innerJoin(s.guardians, eq(s.guardians.id, s.studentGuardians.guardianId)).where(eq(s.studentGuardians.studentId, id)).orderBy(desc(s.studentGuardians.isPrimary), s.guardians.fullName),
    ]);
    return { ...student, history, guardians };
  }
  async function create(actor: Principal, input: unknown, classId?: string) {
    const data = z.object({ fullName, portalId: z.string().trim().toUpperCase().min(3).max(64).regex(/^[A-Z0-9._-]+$/), academicClassId: uuid, startsOn: dateInput }).strict().parse(input);
    await scope(db, actor, classId);
    if (actor.role !== 'admin' && classId !== data.academicClassId) throw new AppError(403, 'Choose your assigned incharge class.');
    return db.transaction(async tx => {
      await tx.execute(sql`LOCK TABLE academic_years IN SHARE MODE`);
      await scope(tx, actor, classId);
      const context = await activeClass(tx, data.academicClassId);
      if (data.startsOn < context.startsOn || data.startsOn > context.endsOn) throw new AppError(400, 'Enrollment date must fall within the academic year.');
      const [student] = await tx.insert(s.students).values({ fullName: data.fullName, portalId: data.portalId }).returning(profileFields);
      const [enrollment] = await tx.insert(s.enrollments).values({ studentId: student.id, academicClassId: data.academicClassId, startsOn: data.startsOn }).returning();
      await audit(tx, actor, 'student.created', student.id, null, student);
      await audit(tx, actor, 'enrollment.created', enrollment.id, null, enrollment);
      return student;
    });
  }
  async function updateProfile(actor: Principal, id: string, input: unknown, classId?: string) {
    const data = z.object({ fullName }).strict().parse(input);
    await db.transaction(async tx => {
      const old = await managedStudent(tx, actor, id, classId, true);
      await tx.update(s.students).set(data).where(eq(s.students.id, id));
      if (old.userId) await tx.update(s.users).set(data).where(eq(s.users.id, old.userId));
      await audit(tx, actor, 'student.profile_changed', id, { fullName: old.fullName }, data);
    });
  }
  async function enroll(actor: Principal, id: string, input: unknown) {
    requireAdmin(actor); uuid.parse(id);
    const data = z.object({ academicClassId: uuid, startsOn: dateInput, expectedEnrollmentId: uuid.nullable() }).strict().parse(input);
    await db.transaction(async tx => {
      await tx.execute(sql`LOCK TABLE academic_years IN SHARE MODE`);
      const student = await managedStudent(tx, actor, id, undefined, true);
      if (student.status !== 'active') throw new AppError(400, 'Set the student status to active before enrolling.');
      const context = await activeClass(tx, data.academicClassId);
      if (data.startsOn < context.startsOn || data.startsOn > context.endsOn) throw new AppError(400, 'Enrollment date must fall within the selected academic year.');
      const [previous] = await tx.select({ id: s.enrollments.id, academicClassId: s.enrollments.academicClassId, startsOn: s.enrollments.startsOn, endsOn: s.enrollments.endsOn, yearEndsOn: s.academicYears.endsOn }).from(s.enrollments).innerJoin(s.academicClasses, eq(s.academicClasses.id, s.enrollments.academicClassId)).innerJoin(s.academicYears, eq(s.academicYears.id, s.academicClasses.academicYearId)).where(eq(s.enrollments.studentId, id)).orderBy(desc(s.enrollments.startsOn)).limit(1);
      if ((previous?.id ?? null) !== data.expectedEnrollmentId) throw new AppError(409, 'Enrollment changed. Reload the student before continuing.');
      if (previous) {
        if (previous.academicClassId === data.academicClassId && previous.endsOn === null) throw new AppError(400, 'The student is already enrolled in this class.');
        if (data.startsOn <= previous.startsOn || (previous.endsOn && data.startsOn <= previous.endsOn)) throw new AppError(400, 'The new enrollment must start after the previous enrollment.');
        if (!previous.endsOn) {
          const endsOn = dayBefore(data.startsOn) < previous.yearEndsOn ? dayBefore(data.startsOn) : previous.yearEndsOn;
          await tx.update(s.enrollments).set({ endsOn }).where(eq(s.enrollments.id, previous.id));
          await audit(tx, actor, 'enrollment.closed', previous.id, previous, { endsOn });
        }
      }
      const [next] = await tx.insert(s.enrollments).values({ studentId: id, academicClassId: data.academicClassId, startsOn: data.startsOn }).returning();
      await audit(tx, actor, 'enrollment.created', next.id, null, next);
    });
  }
  async function setStatus(actor: Principal, id: string, input: unknown, classId?: string) {
    const data = z.object({ status: z.enum(['active', 'inactive', 'transferred', 'withdrawn', 'graduated']), effectiveOn: dateInput }).strict().parse(input);
    if (data.effectiveOn > today()) throw new AppError(400, 'Status changes cannot be scheduled for a future date.');
    await db.transaction(async tx => {
      const student = await managedStudent(tx, actor, id, classId, true);
      const [open] = await tx.select({ id: s.enrollments.id, startsOn: s.enrollments.startsOn, yearEndsOn: s.academicYears.endsOn }).from(s.enrollments).innerJoin(s.academicClasses, eq(s.academicClasses.id, s.enrollments.academicClassId)).innerJoin(s.academicYears, eq(s.academicYears.id, s.academicClasses.academicYearId)).where(and(eq(s.enrollments.studentId, id), isNull(s.enrollments.endsOn))).limit(1);
      if (data.status !== 'active' && open) {
        if (data.effectiveOn < open.startsOn || data.effectiveOn > open.yearEndsOn) throw new AppError(400, 'Choose an end date within the open enrollment year.');
        await tx.update(s.enrollments).set({ endsOn: data.effectiveOn }).where(eq(s.enrollments.id, open.id));
        await audit(tx, actor, 'enrollment.closed', open.id, { endsOn: null }, { endsOn: data.effectiveOn });
      }
      await tx.update(s.students).set({ status: data.status }).where(eq(s.students.id, id));
      if (data.status !== 'active' && student.userId) {
        const [account] = await tx.select({ status: s.users.status }).from(s.users).where(eq(s.users.id, student.userId));
        await tx.update(s.users).set({ status: 'inactive', authVersion: sql`${s.users.authVersion} + 1` }).where(eq(s.users.id, student.userId));
        await tx.delete(s.sessions).where(eq(s.sessions.userId, student.userId));
        await audit(tx, actor, 'account.status_changed', student.userId, { status: account.status }, { status: 'inactive' });
      }
      await audit(tx, actor, 'student.status_changed', id, { status: student.status }, data);
    });
  }
  async function guardianSearch(actor: Principal, query: string) {
    requireAdmin(actor); const text = z.string().trim().min(2).max(100).parse(query);
    return db.select({ id: s.guardians.id, fullName: s.guardians.fullName, phone: s.guardians.phone }).from(s.guardians).where(or(ilike(s.guardians.fullName, literalSearch(text)), ilike(s.guardians.phone, literalSearch(text)))).orderBy(s.guardians.fullName).limit(20);
  }
  async function addGuardian(actor: Principal, id: string, input: unknown, classId?: string) {
    const data = z.union([guardianFields, linkGuardianFields]).parse(input);
    await db.transaction(async tx => {
      await managedStudent(tx, actor, id, classId, true);
      await tx.execute(sql`LOCK TABLE guardians IN SHARE ROW EXCLUSIVE MODE`);
      let guardianId: string;
      if ('guardianId' in data) {
        requireAdmin(actor);
        const [existing] = await tx.select().from(s.guardians).where(eq(s.guardians.id, data.guardianId));
        if (!existing) throw new AppError(404, 'Guardian not found.'); guardianId = existing.id;
      } else {
        const [existing] = await tx.select({ id: s.guardians.id }).from(s.guardians).where(and(eq(s.guardians.phone, data.phone), sql`lower(${s.guardians.fullName}) = lower(${data.fullName})`)).limit(1);
        if (existing) throw new AppError(409, 'This guardian already exists. Ask an administrator to link the existing guardian.');
        const [created] = await tx.insert(s.guardians).values({ fullName: data.fullName, phone: data.phone, whatsapp: data.whatsapp, whatsappOptInAt: data.whatsappConsent ? new Date() : null }).returning();
        guardianId = created.id; await audit(tx, actor, 'guardian.created', created.id, null, created);
      }
      if (data.isPrimary) await clearPrimary(tx, actor, id);
      const [link] = await tx.insert(s.studentGuardians).values({ studentId: id, guardianId, relationship: data.relationship, isPrimary: data.isPrimary }).returning();
      await audit(tx, actor, 'student.guardian_linked', id, null, link);
    });
  }
  async function updateGuardian(actor: Principal, id: string, linkId: string, input: unknown, classId?: string) {
    uuid.parse(linkId); const data = guardianFields.parse(input);
    await db.transaction(async tx => {
      await managedStudent(tx, actor, id, classId, true);
      await tx.execute(sql`LOCK TABLE guardians IN SHARE ROW EXCLUSIVE MODE`);
      const [link] = await tx.select().from(s.studentGuardians).where(and(eq(s.studentGuardians.id, linkId), eq(s.studentGuardians.studentId, id)));
      if (!link) throw new AppError(404, 'Guardian relationship not found.');
      const [old] = await tx.select().from(s.guardians).where(eq(s.guardians.id, link.guardianId)).for('update');
      const shared = await tx.select({ studentId: s.studentGuardians.studentId }).from(s.studentGuardians).where(eq(s.studentGuardians.guardianId, link.guardianId)).limit(2);
      const contactChanged = old.fullName !== data.fullName || old.phone !== data.phone || old.whatsapp !== data.whatsapp || Boolean(old.whatsappOptInAt) !== data.whatsappConsent;
      if (shared.length > 1 && actor.role !== 'admin' && contactChanged) throw new AppError(403, 'A shared guardian contact must be changed by an administrator. You can still update this student’s relationship or primary contact.');
      const [duplicate] = await tx.select({ id: s.guardians.id }).from(s.guardians).where(and(eq(s.guardians.phone, data.phone), sql`lower(${s.guardians.fullName}) = lower(${data.fullName})`, sql`${s.guardians.id} <> ${old.id}`)).limit(1);
      if (duplicate) throw new AppError(409, 'This guardian already exists. Link the existing contact instead of duplicating it.');
      const whatsappOptInAt = data.whatsappConsent ? (old.whatsapp === data.whatsapp && old.whatsappOptInAt ? old.whatsappOptInAt : new Date()) : null;
      await tx.update(s.guardians).set({ fullName: data.fullName, phone: data.phone, whatsapp: data.whatsapp, whatsappOptInAt }).where(eq(s.guardians.id, old.id));
      if (data.isPrimary) await clearPrimary(tx, actor, id);
      await tx.update(s.studentGuardians).set({ relationship: data.relationship, isPrimary: data.isPrimary }).where(eq(s.studentGuardians.id, linkId));
      await audit(tx, actor, 'guardian.updated', old.id, { ...old, studentId: id, linkId, relationship: link.relationship, isPrimary: link.isPrimary }, { ...data, studentId: id, linkId });
    });
  }
  return { classOptions, list, details, create, updateProfile, enroll, setStatus, guardianSearch, addGuardian, updateGuardian };
}

async function clearPrimary(tx: Store, actor: Principal, studentId: string) {
  const prior = await tx.update(s.studentGuardians).set({ isPrimary: false }).where(and(eq(s.studentGuardians.studentId, studentId), eq(s.studentGuardians.isPrimary, true))).returning();
  for (const link of prior) await audit(tx, actor, 'student.guardian_primary_changed', link.id, { studentId, isPrimary: true }, { studentId, isPrimary: false });
}
