-- Custom SQL migration file, put your code below! --
-- Audit events cannot be rewritten through ordinary application operations.
CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
--> statement-breakpoint
-- Profile identities and account roles stay consistent even outside service code.
CREATE FUNCTION validate_profile_role() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_role account_role;
BEGIN
  expected_role := CASE WHEN TG_TABLE_NAME = 'teachers' THEN 'teacher'::account_role ELSE 'student'::account_role END;
  IF NEW.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND role = expected_role) THEN
    RAISE EXCEPTION 'Profile and account role must match';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER teacher_role BEFORE INSERT OR UPDATE ON teachers FOR EACH ROW EXECUTE FUNCTION validate_profile_role();
--> statement-breakpoint
CREATE TRIGGER student_role BEFORE INSERT OR UPDATE ON students FOR EACH ROW EXECUTE FUNCTION validate_profile_role();
--> statement-breakpoint
CREATE FUNCTION preserve_account_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role <> OLD.role THEN RAISE EXCEPTION 'Account roles are immutable; provision the correct account type'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER immutable_account_role BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION preserve_account_role();
--> statement-breakpoint
CREATE FUNCTION preserve_student_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id THEN RAISE EXCEPTION 'Student identity is immutable'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER immutable_student_identity BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION preserve_student_identity();
--> statement-breakpoint
-- Serialize enrollment changes per student and reject overlapping date ranges.
-- Closing an old enrollment and inserting the next enrollment belong in one transaction.
CREATE FUNCTION validate_enrollment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE year_start date; year_end date;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.student_id <> OLD.student_id OR NEW.academic_class_id <> OLD.academic_class_id) THEN
    RAISE EXCEPTION 'Enrollment identity is immutable; close it and create the next enrollment';
  END IF;
  PERFORM id FROM students WHERE id = NEW.student_id FOR UPDATE;
  SELECT y.starts_on, y.ends_on INTO year_start, year_end
    FROM academic_classes c JOIN academic_years y ON y.id = c.academic_year_id
    WHERE c.id = NEW.academic_class_id;
  IF NEW.starts_on < year_start OR NEW.starts_on > year_end OR COALESCE(NEW.ends_on, year_end) > year_end THEN
    RAISE EXCEPTION 'Enrollment must fall within its academic year';
  END IF;
  IF EXISTS (
    SELECT 1 FROM enrollments e
    JOIN academic_classes c ON c.id = e.academic_class_id
    JOIN academic_years y ON y.id = c.academic_year_id
    WHERE e.student_id = NEW.student_id AND e.id <> NEW.id
      AND daterange(e.starts_on, COALESCE(e.ends_on, y.ends_on), '[]') && daterange(NEW.starts_on, COALESCE(NEW.ends_on, year_end), '[]')
  ) THEN RAISE EXCEPTION 'Student enrollment dates overlap'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER enrollment_integrity BEFORE INSERT OR UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION validate_enrollment();
--> statement-breakpoint
CREATE FUNCTION preserve_class_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.academic_year_id <> OLD.academic_year_id OR NEW.section_id <> OLD.section_id THEN
    RAISE EXCEPTION 'Academic class context is immutable; create a new academic class';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER immutable_class_context BEFORE UPDATE ON academic_classes FOR EACH ROW EXECUTE FUNCTION preserve_class_context();
--> statement-breakpoint
CREATE FUNCTION preserve_used_year_dates() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.starts_on <> OLD.starts_on OR NEW.ends_on <> OLD.ends_on) AND EXISTS (SELECT 1 FROM academic_classes WHERE academic_year_id = OLD.id) THEN
    RAISE EXCEPTION 'Dates of a configured academic year require a reviewed migration';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER used_year_dates BEFORE UPDATE ON academic_years FOR EACH ROW EXECUTE FUNCTION preserve_used_year_dates();
