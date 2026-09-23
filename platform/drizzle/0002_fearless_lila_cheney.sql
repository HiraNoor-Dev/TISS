CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'leave');--> statement-breakpoint
CREATE TYPE "public"."observation_category" AS ENUM('cleanliness', 'uniform', 'personal_hygiene', 'discipline', 'general_conduct');--> statement-breakpoint
CREATE TYPE "public"."observation_rating" AS ENUM('good', 'needs_improvement', 'concern');--> statement-breakpoint
CREATE TYPE "public"."result_status" AS ENUM('present', 'absent', 'not_attempted');--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"name" text NOT NULL,
	"on_date" date NOT NULL,
	"total_marks" numeric(8, 2) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positive_total_marks" CHECK ("assessments"."total_marks" > 0)
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_class_id" uuid NOT NULL,
	"on_date" date NOT NULL,
	"author_id" uuid NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observation_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"rating" "observation_rating" NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observation_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_class_id" uuid NOT NULL,
	"on_date" date NOT NULL,
	"category" "observation_category" NOT NULL,
	"author_id" uuid NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"status" "result_status" NOT NULL,
	"marks" numeric(8, 2),
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "result_status_marks" CHECK (("test_results"."status" = 'present' AND "test_results"."marks" IS NOT NULL AND "test_results"."marks" >= 0) OR ("test_results"."status" <> 'present' AND "test_results"."marks" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_academic_class_id_academic_classes_id_fk" FOREIGN KEY ("academic_class_id") REFERENCES "public"."academic_classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_author_id_teachers_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."teachers"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_sheet_id_attendance_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."attendance_sheets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_updated_by_teachers_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."teachers"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sheets" ADD CONSTRAINT "attendance_sheets_academic_class_id_academic_classes_id_fk" FOREIGN KEY ("academic_class_id") REFERENCES "public"."academic_classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sheets" ADD CONSTRAINT "attendance_sheets_author_id_teachers_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."teachers"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_records" ADD CONSTRAINT "observation_records_sheet_id_observation_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."observation_sheets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_records" ADD CONSTRAINT "observation_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_records" ADD CONSTRAINT "observation_records_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_sheets" ADD CONSTRAINT "observation_sheets_academic_class_id_academic_classes_id_fk" FOREIGN KEY ("academic_class_id") REFERENCES "public"."academic_classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_sheets" ADD CONSTRAINT "observation_sheets_author_id_teachers_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."teachers"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_updated_by_teachers_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."teachers"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessment_class_subject_date" ON "assessments" USING btree ("academic_class_id","subject_id","on_date");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_student_attendance" ON "attendance_records" USING btree ("sheet_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_class_attendance" ON "attendance_sheets" USING btree ("academic_class_id","on_date");--> statement-breakpoint
CREATE UNIQUE INDEX "one_student_observation_per_sheet" ON "observation_records" USING btree ("sheet_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_daily_category" ON "observation_sheets" USING btree ("academic_class_id","on_date","category","author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_result_per_test_student" ON "test_results" USING btree ("assessment_id","student_id");