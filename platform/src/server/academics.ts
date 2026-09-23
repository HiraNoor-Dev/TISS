import { and, eq, isNull, lte, gte, or } from 'drizzle-orm';
import type { Database } from '../db/types';
import { academicClasses, academicYears, divisions, grades, sections, subjects, enrollments, students, guardians, studentGuardians, teachingAssignments, inchargeAssignments } from '../db/schema';
import type { Principal } from './auth';
import { requireClassAccess } from './permissions';
import { uuid } from './validation';
import { AppError } from './errors';

export function academicService(db: Database, today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date())) {
  async function responsibilities(actor: Principal) {
    if (actor.mustChangePassword) throw new AppError(403, 'Change your temporary password first.');
    if (actor.role !== 'teacher') return [];
    const teaching = await db.select({ classId: teachingAssignments.academicClassId, subject: subjects.name, subjectId: subjects.id }).from(teachingAssignments)
      .innerJoin(subjects, eq(subjects.id, teachingAssignments.subjectId))
      .where(and(eq(teachingAssignments.teacherId, actor.id), isNull(teachingAssignments.revokedAt), eq(subjects.isActive, true)));
    const incharge = await db.select({ classId: inchargeAssignments.academicClassId }).from(inchargeAssignments).where(and(eq(inchargeAssignments.teacherId, actor.id), isNull(inchargeAssignments.revokedAt)));
    const contexts = await db.select({ classId: academicClasses.id, year: academicYears.name, division: divisions.name, grade: grades.name, section: sections.name }).from(academicClasses)
      .innerJoin(academicYears, eq(academicYears.id, academicClasses.academicYearId)).innerJoin(sections, eq(sections.id, academicClasses.sectionId))
      .innerJoin(grades, eq(grades.id, sections.gradeId)).innerJoin(divisions, eq(divisions.id, grades.divisionId))
      .where(and(eq(academicYears.isCurrent, true), eq(academicYears.isActive, true), eq(academicClasses.isActive, true), eq(sections.isActive, true), eq(grades.isActive, true), eq(divisions.isActive, true)));
    return contexts.filter(c => teaching.some(t => t.classId === c.classId) || incharge.some(i => i.classId === c.classId)).map(c => ({
      ...c, isIncharge: incharge.some(i => i.classId === c.classId),
      subjects: teaching.filter(t => t.classId === c.classId).map(t => ({ id: t.subjectId, name: t.subject })),
    }));
  }
  async function roster(actor: Principal, classId: string, page = 1) {
    uuid.parse(classId);
    await requireClassAccess(db, actor, classId, 'roster');
    const onDate = today();
    return db.select({ studentId: students.id, portalId: students.portalId, fullName: students.fullName, enrollmentId: enrollments.id }).from(enrollments)
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .where(and(eq(enrollments.academicClassId, classId), eq(students.status, 'active'), lte(enrollments.startsOn, onDate), or(isNull(enrollments.endsOn), gte(enrollments.endsOn, onDate))))
      .orderBy(students.portalId).limit(50).offset((page - 1) * 50);
  }
  async function contacts(actor: Principal, classId: string, studentId: string) {
    uuid.parse(classId); uuid.parse(studentId);
    await requireClassAccess(db, actor, classId, 'contacts');
    const onDate = today();
    const [enrollment] = await db.select({ id: enrollments.id }).from(enrollments).where(and(eq(enrollments.academicClassId, classId), eq(enrollments.studentId, studentId), lte(enrollments.startsOn, onDate), or(isNull(enrollments.endsOn), gte(enrollments.endsOn, onDate)))).limit(1);
    if (!enrollment) throw new AppError(404, 'Current enrollment not found.');
    return db.select({ name: guardians.fullName, phone: guardians.phone, whatsapp: guardians.whatsapp, relationship: studentGuardians.relationship, isPrimary: studentGuardians.isPrimary }).from(studentGuardians)
      .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId)).where(eq(studentGuardians.studentId, studentId));
  }
  async function ownProfile(actor: Principal) {
    if (actor.role !== 'student' || actor.mustChangePassword) throw new AppError(403, 'Student access is required.');
    const [student] = await db.select({ id: students.id, portalId: students.portalId, fullName: students.fullName, status: students.status }).from(students).where(eq(students.userId, actor.id)).limit(1);
    if (!student) throw new AppError(404, 'Student profile not found.');
    const history = await db.select({ enrollmentId: enrollments.id, startsOn: enrollments.startsOn, endsOn: enrollments.endsOn, year: academicYears.name, grade: grades.name, section: sections.name }).from(enrollments)
      .innerJoin(academicClasses, eq(academicClasses.id, enrollments.academicClassId)).innerJoin(academicYears, eq(academicYears.id, academicClasses.academicYearId))
      .innerJoin(sections, eq(sections.id, academicClasses.sectionId)).innerJoin(grades, eq(grades.id, sections.gradeId))
      .where(eq(enrollments.studentId, student.id)).orderBy(enrollments.startsOn);
    return { ...student, enrollments: history };
  }
  return { responsibilities, roster, contacts, ownProfile };
}
