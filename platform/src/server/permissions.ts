import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../db/types';
import { academicClasses, academicYears, divisions, grades, sections, subjects, teachingAssignments, inchargeAssignments } from '../db/schema';
import type { Principal } from './auth';
import { AppError } from './errors';

export function requireAdmin(actor: Principal) {
  if (actor.role !== 'admin' || actor.mustChangePassword) throw new AppError(403, 'Administrator access is required.');
}
export async function requireClassAccess(db: Pick<Database, 'select'>, actor: Principal, classId: string, capability: 'roster' | 'contacts' | 'marks', subjectId?: string) {
  if (actor.mustChangePassword) throw new AppError(403, 'Change your temporary password before continuing.');
  // Admin classroom corrections will have their own explicit permission workflow.
  if (actor.role === 'admin' && capability !== 'marks') return;
  if (actor.role !== 'teacher') throw new AppError(403, 'This class is outside your responsibilities.');
  const [context] = await db.select({ id: academicClasses.id }).from(academicClasses)
    .innerJoin(academicYears, eq(academicYears.id, academicClasses.academicYearId))
    .innerJoin(sections, eq(sections.id, academicClasses.sectionId))
    .innerJoin(grades, eq(grades.id, sections.gradeId)).innerJoin(divisions, eq(divisions.id, grades.divisionId))
    .where(and(eq(academicClasses.id, classId), eq(academicClasses.isActive, true), eq(academicYears.isActive, true), eq(academicYears.isCurrent, true), eq(sections.isActive, true), eq(grades.isActive, true), eq(divisions.isActive, true))).limit(1);
  if (!context) throw new AppError(403, 'This class is outside your active responsibilities.');
  if (capability !== 'marks') {
    const [incharge] = await db.select({ id: inchargeAssignments.id }).from(inchargeAssignments).where(and(eq(inchargeAssignments.teacherId, actor.id), eq(inchargeAssignments.academicClassId, classId), isNull(inchargeAssignments.revokedAt))).limit(1);
    if (incharge) return;
  }
  if (capability === 'contacts' || (capability === 'marks' && !subjectId)) throw new AppError(403, 'You do not have this class permission.');
  const [assignment] = await db.select({ id: teachingAssignments.id }).from(teachingAssignments)
    .innerJoin(subjects, eq(subjects.id, teachingAssignments.subjectId)).where(and(eq(teachingAssignments.teacherId, actor.id), eq(teachingAssignments.academicClassId, classId), isNull(teachingAssignments.revokedAt), eq(subjects.isActive, true), subjectId ? eq(teachingAssignments.subjectId, subjectId) : undefined)).limit(1);
  if (!assignment) throw new AppError(403, 'You do not have this class and subject assignment.');
}
