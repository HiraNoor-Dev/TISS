-- Keep academic context fixed once a classroom sheet has been created.
CREATE FUNCTION classroom_sheet_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE year_start date; year_end date;
BEGIN
  SELECT y.starts_on, y.ends_on INTO year_start, year_end
  FROM academic_classes c JOIN academic_years y ON y.id = c.academic_year_id WHERE c.id = NEW.academic_class_id;
  IF NEW.on_date < year_start OR NEW.on_date > year_end THEN RAISE EXCEPTION 'Classroom date outside academic year'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.academic_class_id <> OLD.academic_class_id OR NEW.on_date <> OLD.on_date OR NEW.author_id <> OLD.author_id THEN
      RAISE EXCEPTION 'Classroom context cannot be rewritten';
    END IF;
    IF TG_TABLE_NAME = 'assessments' THEN
      IF NEW.subject_id <> OLD.subject_id OR NEW.total_marks <> OLD.total_marks OR NEW.name <> OLD.name OR NEW.description <> OLD.description THEN RAISE EXCEPTION 'Assessment definition cannot be rewritten'; END IF;
    ELSIF TG_TABLE_NAME = 'observation_sheets' THEN
      IF NEW.category <> OLD.category THEN RAISE EXCEPTION 'Observation category cannot be rewritten'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER assessment_context BEFORE INSERT OR UPDATE ON assessments FOR EACH ROW EXECUTE FUNCTION classroom_sheet_guard();
--> statement-breakpoint
CREATE TRIGGER attendance_context BEFORE INSERT OR UPDATE ON attendance_sheets FOR EACH ROW EXECUTE FUNCTION classroom_sheet_guard();
--> statement-breakpoint
CREATE TRIGGER observation_context BEFORE INSERT OR UPDATE ON observation_sheets FOR EACH ROW EXECUTE FUNCTION classroom_sheet_guard();
--> statement-breakpoint
CREATE FUNCTION classroom_record_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE class_id uuid; record_date date; maximum numeric; enrollment enrollments%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'test_results' THEN
    SELECT academic_class_id, on_date, total_marks INTO class_id, record_date, maximum FROM assessments WHERE id = NEW.assessment_id;
    IF NEW.marks > maximum THEN RAISE EXCEPTION 'Marks exceed assessment total'; END IF;
  ELSIF TG_TABLE_NAME = 'attendance_records' THEN
    SELECT academic_class_id, on_date INTO class_id, record_date FROM attendance_sheets WHERE id = NEW.sheet_id;
  ELSE
    SELECT academic_class_id, on_date INTO class_id, record_date FROM observation_sheets WHERE id = NEW.sheet_id;
  END IF;
  SELECT * INTO enrollment FROM enrollments WHERE id = NEW.enrollment_id FOR SHARE;
  IF NOT FOUND OR enrollment.student_id <> NEW.student_id OR enrollment.academic_class_id <> class_id OR record_date < enrollment.starts_on OR (enrollment.ends_on IS NOT NULL AND record_date > enrollment.ends_on) THEN
    RAISE EXCEPTION 'Classroom record must match dated enrollment';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.student_id <> OLD.student_id OR NEW.enrollment_id <> OLD.enrollment_id THEN RAISE EXCEPTION 'Record student identity cannot be rewritten'; END IF;
    IF TG_TABLE_NAME = 'test_results' THEN
      IF NEW.assessment_id <> OLD.assessment_id THEN RAISE EXCEPTION 'Result test cannot be rewritten'; END IF;
    ELSE
      IF NEW.sheet_id <> OLD.sheet_id THEN RAISE EXCEPTION 'Record sheet cannot be rewritten'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER result_integrity BEFORE INSERT OR UPDATE ON test_results FOR EACH ROW EXECUTE FUNCTION classroom_record_guard();
--> statement-breakpoint
CREATE TRIGGER attendance_integrity BEFORE INSERT OR UPDATE ON attendance_records FOR EACH ROW EXECUTE FUNCTION classroom_record_guard();
--> statement-breakpoint
CREATE TRIGGER observation_integrity BEFORE INSERT OR UPDATE ON observation_records FOR EACH ROW EXECUTE FUNCTION classroom_record_guard();
--> statement-breakpoint
CREATE FUNCTION enrollment_classroom_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT a.on_date FROM test_results r JOIN assessments a ON a.id = r.assessment_id WHERE r.enrollment_id = NEW.id
      UNION ALL SELECT a.on_date FROM attendance_records r JOIN attendance_sheets a ON a.id = r.sheet_id WHERE r.enrollment_id = NEW.id
      UNION ALL SELECT a.on_date FROM observation_records r JOIN observation_sheets a ON a.id = r.sheet_id WHERE r.enrollment_id = NEW.id
    ) records WHERE records.on_date < NEW.starts_on OR (NEW.ends_on IS NOT NULL AND records.on_date > NEW.ends_on)
  ) THEN RAISE EXCEPTION 'Enrollment date change would invalidate recorded classroom history'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER preserve_classroom_history BEFORE UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION enrollment_classroom_history_guard();
