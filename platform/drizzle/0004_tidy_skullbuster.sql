CREATE TYPE "public"."remark_category" AS ENUM('academic', 'homework', 'behaviour', 'discipline', 'attendance_concern', 'cleanliness', 'positive_achievement', 'general');--> statement-breakpoint
CREATE TYPE "public"."remark_status" AS ENUM('internal', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "remarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_class_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"on_date" date NOT NULL,
	"category" "remark_category" NOT NULL,
	"content" text NOT NULL,
	"parent_visible" boolean DEFAULT false NOT NULL,
	"student_visible" boolean DEFAULT false NOT NULL,
	"status" "remark_status" DEFAULT 'internal' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"review_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "remark_text_bounds" CHECK (length(trim("remarks"."content")) BETWEEN 1 AND 3000 AND length("remarks"."review_note") <= 500),
	CONSTRAINT "remark_audience_status" CHECK (("remarks"."status" = 'internal' AND NOT "remarks"."parent_visible" AND NOT "remarks"."student_visible") OR ("remarks"."status" <> 'internal' AND ("remarks"."parent_visible" OR "remarks"."student_visible"))),
	CONSTRAINT "remark_approval_metadata" CHECK (("remarks"."status" = 'approved' AND "remarks"."approved_by" IS NOT NULL AND "remarks"."approved_at" IS NOT NULL) OR ("remarks"."status" <> 'approved' AND "remarks"."approved_by" IS NULL AND "remarks"."approved_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "remarks" ADD CONSTRAINT "remarks_academic_class_id_academic_classes_id_fk" FOREIGN KEY ("academic_class_id") REFERENCES "public"."academic_classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remarks" ADD CONSTRAINT "remarks_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remarks" ADD CONSTRAINT "remarks_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remarks" ADD CONSTRAINT "remarks_author_id_teachers_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."teachers"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remarks" ADD CONSTRAINT "remarks_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "remark_class_date" ON "remarks" USING btree ("academic_class_id","on_date");--> statement-breakpoint
CREATE INDEX "remark_student" ON "remarks" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "remark_enrollment" ON "remarks" USING btree ("enrollment_id");