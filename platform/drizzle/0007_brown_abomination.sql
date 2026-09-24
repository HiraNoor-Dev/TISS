CREATE TYPE "public"."whatsapp_dispatch_kind" AS ENUM('initial', 'correction');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_dispatch_status" AS ENUM('queued', 'processing', 'completed', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_recipient_status" AS ENUM('queued', 'processing', 'accepted', 'sent', 'delivered', 'read', 'failed', 'uncertain');--> statement-breakpoint
CREATE TABLE "result_dispatch_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"recipient_phone" text NOT NULL,
	"student_name" text NOT NULL,
	"guardian_name" text NOT NULL,
	"result_status" "result_status" NOT NULL,
	"marks" numeric(8, 2),
	"total_marks" numeric(8, 2) NOT NULL,
	"status" "whatsapp_recipient_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"error_code" text,
	"error_detail" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"status_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "result_dispatch_recipients_provider_message_id_unique" UNIQUE("provider_message_id"),
	CONSTRAINT "dispatch_recipient_phone" CHECK ("result_dispatch_recipients"."recipient_phone" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "dispatch_recipient_result" CHECK (("result_dispatch_recipients"."result_status" = 'present' AND "result_dispatch_recipients"."marks" IS NOT NULL AND "result_dispatch_recipients"."marks" >= 0 AND "result_dispatch_recipients"."marks" <= "result_dispatch_recipients"."total_marks") OR ("result_dispatch_recipients"."result_status" <> 'present' AND "result_dispatch_recipients"."marks" IS NULL)),
	CONSTRAINT "dispatch_recipient_attempts" CHECK ("result_dispatch_recipients"."attempt_count" >= 0 AND "result_dispatch_recipients"."total_marks" > 0)
);
--> statement-breakpoint
CREATE TABLE "result_dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"assessment_version" integer NOT NULL,
	"kind" "whatsapp_dispatch_kind" NOT NULL,
	"triggered_by" uuid NOT NULL,
	"status" "whatsapp_dispatch_status" DEFAULT 'queued' NOT NULL,
	"template_name" text NOT NULL,
	"template_language" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "dispatch_version_nonnegative" CHECK ("result_dispatches"."assessment_version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "guardians" ADD COLUMN "whatsapp_opt_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "result_dispatch_recipients" ADD CONSTRAINT "result_dispatch_recipients_dispatch_id_result_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."result_dispatches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_dispatch_recipients" ADD CONSTRAINT "result_dispatch_recipients_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_dispatch_recipients" ADD CONSTRAINT "result_dispatch_recipients_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_dispatches" ADD CONSTRAINT "result_dispatches_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_dispatches" ADD CONSTRAINT "result_dispatches_triggered_by_teachers_user_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."teachers"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_dispatch_per_student" ON "result_dispatch_recipients" USING btree ("dispatch_id","student_id");--> statement-breakpoint
CREATE INDEX "recipient_send_queue" ON "result_dispatch_recipients" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "one_dispatch_per_assessment_version" ON "result_dispatches" USING btree ("assessment_id","assessment_version");--> statement-breakpoint
CREATE INDEX "dispatch_status_created" ON "result_dispatches" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardian_whatsapp_consent" CHECK ("guardians"."whatsapp_opt_in_at" IS NULL OR "guardians"."whatsapp" IS NOT NULL);
--> statement-breakpoint
CREATE FUNCTION protect_result_dispatch_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF ROW(NEW.assessment_id, NEW.assessment_version, NEW.kind, NEW.triggered_by, NEW.template_name, NEW.template_language, NEW.created_at)
		IS DISTINCT FROM ROW(OLD.assessment_id, OLD.assessment_version, OLD.kind, OLD.triggered_by, OLD.template_name, OLD.template_language, OLD.created_at) THEN
		RAISE EXCEPTION 'result dispatch identity is immutable' USING ERRCODE = 'P0001';
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER result_dispatch_identity_immutable BEFORE UPDATE ON result_dispatches FOR EACH ROW EXECUTE FUNCTION protect_result_dispatch_identity();
--> statement-breakpoint
CREATE FUNCTION protect_result_dispatch_recipient_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF ROW(NEW.dispatch_id, NEW.student_id, NEW.guardian_id, NEW.recipient_phone, NEW.student_name, NEW.guardian_name, NEW.result_status, NEW.marks, NEW.total_marks, NEW.created_at)
		IS DISTINCT FROM ROW(OLD.dispatch_id, OLD.student_id, OLD.guardian_id, OLD.recipient_phone, OLD.student_name, OLD.guardian_name, OLD.result_status, OLD.marks, OLD.total_marks, OLD.created_at) THEN
		RAISE EXCEPTION 'result dispatch recipient snapshot is immutable' USING ERRCODE = 'P0001';
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER result_dispatch_recipient_snapshot_immutable BEFORE UPDATE ON result_dispatch_recipients FOR EACH ROW EXECUTE FUNCTION protect_result_dispatch_recipient_snapshot();
