ALTER TABLE "attendance_records" DROP CONSTRAINT "attendance_records_updated_by_teachers_user_id_fk";
--> statement-breakpoint
ALTER TABLE "test_results" DROP CONSTRAINT "test_results_updated_by_teachers_user_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;