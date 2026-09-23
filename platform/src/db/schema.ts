import { sql } from 'drizzle-orm';
import { pgTable, pgEnum, uuid, text, timestamp, boolean, integer, numeric, date, jsonb, uniqueIndex, index, check } from 'drizzle-orm/pg-core';

export const accountRole = pgEnum('account_role', ['admin', 'teacher', 'student']);
export const accountStatus = pgEnum('account_status', ['active', 'inactive', 'suspended']);
export const studentStatus = pgEnum('student_status', ['active', 'inactive', 'transferred', 'withdrawn', 'graduated']);
const id = () => uuid('id').primaryKey().defaultRandom();
const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: id(), username: text('username').notNull().unique(), fullName: text('full_name').notNull(),
  passwordHash: text('password_hash').notNull(), role: accountRole('role').notNull(),
  status: accountStatus('status').notNull().default('active'),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  authVersion: integer('auth_version').notNull().default(1),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }), createdAt: created(),
}, t => [check('username_canonical', sql`${t.username} = lower(trim(${t.username})) AND length(${t.username}) BETWEEN 3 AND 64`)]);

export const teachers = pgTable('teachers', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'restrict' }),
});
export const students = pgTable('students', {
  id: id(), portalId: text('portal_id').notNull().unique(), fullName: text('full_name').notNull(),
  userId: uuid('user_id').unique().references(() => users.id, { onDelete: 'restrict' }),
  status: studentStatus('status').notNull().default('active'), createdAt: created(),
}, t => [check('portal_id_canonical', sql`${t.portalId} = upper(trim(${t.portalId})) AND length(${t.portalId}) BETWEEN 3 AND 64`)]);
export const guardians = pgTable('guardians', {
  id: id(), fullName: text('full_name').notNull(), phone: text('phone').notNull(),
  whatsapp: text('whatsapp'), createdAt: created(),
});
export const studentGuardians = pgTable('student_guardians', {
  id: id(), studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  guardianId: uuid('guardian_id').notNull().references(() => guardians.id, { onDelete: 'restrict' }),
  relationship: text('relationship').notNull(), isPrimary: boolean('is_primary').notNull().default(false),
}, t => [uniqueIndex('student_guardian_pair').on(t.studentId, t.guardianId), uniqueIndex('one_primary_guardian').on(t.studentId).where(sql`${t.isPrimary} = true`)]);

export const academicYears = pgTable('academic_years', {
  id: id(), name: text('name').notNull().unique(), startsOn: date('starts_on').notNull(), endsOn: date('ends_on').notNull(),
  isCurrent: boolean('is_current').notNull().default(false), isActive: boolean('is_active').notNull().default(true),
}, t => [check('year_dates', sql`${t.endsOn} >= ${t.startsOn}`), uniqueIndex('one_current_year').on(t.isCurrent).where(sql`${t.isCurrent} = true`)]);
export const divisions = pgTable('divisions', { id: id(), name: text('name').notNull().unique(), isActive: boolean('is_active').notNull().default(true) });
export const grades = pgTable('grades', {
  id: id(), divisionId: uuid('division_id').notNull().references(() => divisions.id, { onDelete: 'restrict' }),
  name: text('name').notNull(), isActive: boolean('is_active').notNull().default(true),
}, t => [uniqueIndex('grade_in_division').on(t.divisionId, t.name)]);
export const sections = pgTable('sections', {
  id: id(), gradeId: uuid('grade_id').notNull().references(() => grades.id, { onDelete: 'restrict' }),
  name: text('name').notNull(), isActive: boolean('is_active').notNull().default(true),
}, t => [uniqueIndex('section_in_grade').on(t.gradeId, t.name)]);
export const academicClasses = pgTable('academic_classes', {
  id: id(), academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id, { onDelete: 'restrict' }),
  sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'restrict' }),
  isActive: boolean('is_active').notNull().default(true),
}, t => [uniqueIndex('class_year_section').on(t.academicYearId, t.sectionId)]);
export const subjects = pgTable('subjects', { id: id(), code: text('code').notNull().unique(), name: text('name').notNull(), isActive: boolean('is_active').notNull().default(true) });
export const enrollments = pgTable('enrollments', {
  id: id(), studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  academicClassId: uuid('academic_class_id').notNull().references(() => academicClasses.id, { onDelete: 'restrict' }),
  startsOn: date('starts_on').notNull(), endsOn: date('ends_on'), createdAt: created(),
}, t => [
  check('enrollment_dates', sql`${t.endsOn} IS NULL OR ${t.endsOn} >= ${t.startsOn}`),
  uniqueIndex('one_open_enrollment').on(t.studentId).where(sql`${t.endsOn} IS NULL`),
  index('class_enrollments').on(t.academicClassId),
]);
export const teachingAssignments = pgTable('teaching_assignments', {
  id: id(), teacherId: uuid('teacher_id').notNull().references(() => teachers.userId, { onDelete: 'restrict' }),
  academicClassId: uuid('academic_class_id').notNull().references(() => academicClasses.id, { onDelete: 'restrict' }),
  subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'restrict' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }), createdAt: created(),
}, t => [uniqueIndex('active_teaching_assignment').on(t.teacherId, t.academicClassId, t.subjectId).where(sql`${t.revokedAt} IS NULL`)]);
export const inchargeAssignments = pgTable('incharge_assignments', {
  id: id(), teacherId: uuid('teacher_id').notNull().references(() => teachers.userId, { onDelete: 'restrict' }),
  academicClassId: uuid('academic_class_id').notNull().references(() => academicClasses.id, { onDelete: 'restrict' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }), createdAt: created(),
}, t => [uniqueIndex('one_active_incharge').on(t.academicClassId).where(sql`${t.revokedAt} IS NULL`), index('incharge_teacher').on(t.teacherId)]);

export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  authVersion: integer('auth_version').notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), createdAt: created(),
}, t => [index('session_user').on(t.userId), index('session_expiry').on(t.expiresAt)]);
export const loginBuckets = pgTable('login_buckets', {
  key: text('key').primaryKey(), attempts: integer('attempts').notNull(), resetsAt: timestamp('resets_at', { withTimezone: true }).notNull(),
});
export const auditLogs = pgTable('audit_logs', {
  id: id(), actorId: uuid('actor_id').references(() => users.id, { onDelete: 'restrict' }),
  action: text('action').notNull(), entityId: uuid('entity_id').notNull(),
  before: jsonb('before'), after: jsonb('after'), createdAt: created(),
}, t => [index('audit_entity_time').on(t.entityId, t.createdAt)]);

export const resultStatus = pgEnum('result_status', ['present', 'absent', 'not_attempted']);
export const attendanceStatus = pgEnum('attendance_status', ['present', 'absent', 'leave']);
export const observationCategory = pgEnum('observation_category', ['cleanliness', 'uniform', 'personal_hygiene', 'discipline', 'general_conduct']);
export const observationRating = pgEnum('observation_rating', ['good', 'needs_improvement', 'concern']);
const classroomId = () => uuid('academic_class_id').notNull().references(() => academicClasses.id, { onDelete: 'restrict' });
const authorId = () => uuid('author_id').notNull().references(() => teachers.userId, { onDelete: 'restrict' });
const pupilId = () => uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' });
const enrollmentId = () => uuid('enrollment_id').notNull().references(() => enrollments.id, { onDelete: 'restrict' });

export const assessments = pgTable('assessments', {
  id: id(), academicClassId: classroomId(), subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'restrict' }),
  authorId: authorId(), name: text('name').notNull(), onDate: date('on_date').notNull(),
  totalMarks: numeric('total_marks', { precision: 8, scale: 2, mode: 'number' }).notNull(),
  description: text('description').notNull().default(''), version: integer('version').notNull().default(0), createdAt: created(),
}, t => [check('positive_total_marks', sql`${t.totalMarks} > 0`), index('assessment_class_subject_date').on(t.academicClassId, t.subjectId, t.onDate)]);
export const testResults = pgTable('test_results', {
  id: id(), assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'restrict' }), studentId: pupilId(), enrollmentId: enrollmentId(),
  status: resultStatus('status').notNull(), marks: numeric('marks', { precision: 8, scale: 2, mode: 'number' }),
  updatedBy: uuid('updated_by').notNull().references(() => users.id, { onDelete: 'restrict' }), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('one_result_per_test_student').on(t.assessmentId, t.studentId), check('result_status_marks', sql`(${t.status} = 'present' AND ${t.marks} IS NOT NULL AND ${t.marks} >= 0) OR (${t.status} <> 'present' AND ${t.marks} IS NULL)`)]);
export const attendanceSheets = pgTable('attendance_sheets', {
  id: id(), academicClassId: classroomId(), onDate: date('on_date').notNull(), authorId: authorId(), version: integer('version').notNull().default(0), createdAt: created(),
}, t => [uniqueIndex('daily_class_attendance').on(t.academicClassId, t.onDate)]);
export const attendanceRecords = pgTable('attendance_records', {
  id: id(), sheetId: uuid('sheet_id').notNull().references(() => attendanceSheets.id, { onDelete: 'restrict' }), studentId: pupilId(), enrollmentId: enrollmentId(), status: attendanceStatus('status').notNull(),
  updatedBy: uuid('updated_by').notNull().references(() => users.id, { onDelete: 'restrict' }), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('daily_student_attendance').on(t.sheetId, t.studentId)]);
export const observationSheets = pgTable('observation_sheets', {
  id: id(), academicClassId: classroomId(), onDate: date('on_date').notNull(), category: observationCategory('category').notNull(), authorId: authorId(), version: integer('version').notNull().default(0), createdAt: created(),
}, t => [uniqueIndex('teacher_daily_category').on(t.academicClassId, t.onDate, t.category, t.authorId)]);
export const observationRecords = pgTable('observation_records', {
  id: id(), sheetId: uuid('sheet_id').notNull().references(() => observationSheets.id, { onDelete: 'restrict' }), studentId: pupilId(), enrollmentId: enrollmentId(), rating: observationRating('rating').notNull(), note: text('note').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('one_student_observation_per_sheet').on(t.sheetId, t.studentId)]);

export const remarkCategory = pgEnum('remark_category', ['academic', 'homework', 'behaviour', 'discipline', 'attendance_concern', 'cleanliness', 'positive_achievement', 'general']);
export const remarkStatus = pgEnum('remark_status', ['internal', 'pending', 'approved', 'rejected']);
export const remarks = pgTable('remarks', {
  id: id(), academicClassId: classroomId(), studentId: pupilId(), enrollmentId: enrollmentId(), authorId: authorId(),
  onDate: date('on_date').notNull(), category: remarkCategory('category').notNull(), content: text('content').notNull(),
  parentVisible: boolean('parent_visible').notNull().default(false), studentVisible: boolean('student_visible').notNull().default(false),
  status: remarkStatus('status').notNull().default('internal'), version: integer('version').notNull().default(0),
  approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'restrict' }), approvedAt: timestamp('approved_at', { withTimezone: true }),
  reviewNote: text('review_note').notNull().default(''), createdAt: created(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('remark_class_date').on(t.academicClassId, t.onDate), index('remark_student').on(t.studentId), index('remark_enrollment').on(t.enrollmentId),
  check('remark_text_bounds', sql`length(trim(${t.content})) BETWEEN 1 AND 3000 AND length(${t.reviewNote}) <= 500`),
  check('remark_audience_status', sql`(${t.status} = 'internal' AND NOT ${t.parentVisible} AND NOT ${t.studentVisible}) OR (${t.status} <> 'internal' AND (${t.parentVisible} OR ${t.studentVisible}))`),
  check('remark_approval_metadata', sql`(${t.status} = 'approved' AND ${t.approvedBy} IS NOT NULL AND ${t.approvedAt} IS NOT NULL) OR (${t.status} <> 'approved' AND ${t.approvedBy} IS NULL AND ${t.approvedAt} IS NULL)`),
]);
