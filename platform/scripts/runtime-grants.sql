-- Run after migrations with the database owner's connection, never the web app connection.
-- Attach this NOLOGIN role to a dedicated provider-created login; keep its password in hosting secrets.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tiss_runtime') THEN
    CREATE ROLE tiss_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO tiss_runtime;
GRANT SELECT, INSERT, UPDATE ON
  users, teachers, students, guardians, student_guardians,
  academic_years, divisions, grades, sections, academic_classes, subjects,
  enrollments, teaching_assignments, incharge_assignments,
  sessions, login_buckets, assessments, test_results,
  attendance_sheets, attendance_records, observation_sheets, observation_records, remarks
TO tiss_runtime;
GRANT DELETE ON sessions, login_buckets, users, teachers,
  academic_years, divisions, grades, sections, academic_classes, subjects,
  teaching_assignments, incharge_assignments TO tiss_runtime;
GRANT SELECT, INSERT ON audit_logs TO tiss_runtime;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON audit_logs FROM tiss_runtime;
-- No schema CREATE, ownership, TRUNCATE, or migration-schema access is granted.
-- Example with a login created securely by the hosting provider:
-- GRANT tiss_runtime TO your_application_login;
