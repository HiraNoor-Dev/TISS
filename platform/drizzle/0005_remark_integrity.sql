CREATE FUNCTION remark_record_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE enrollment enrollments%ROWTYPE; year_end date;
BEGIN
  SELECT * INTO enrollment FROM enrollments WHERE id = NEW.enrollment_id FOR SHARE;
  IF NOT FOUND OR enrollment.student_id <> NEW.student_id OR enrollment.academic_class_id <> NEW.academic_class_id OR NEW.on_date < enrollment.starts_on OR (enrollment.ends_on IS NOT NULL AND NEW.on_date > enrollment.ends_on) THEN
    RAISE EXCEPTION 'Remark must match dated enrollment';
  END IF;
  SELECT y.ends_on INTO year_end FROM academic_classes c JOIN academic_years y ON y.id = c.academic_year_id WHERE c.id = NEW.academic_class_id;
  IF NEW.on_date > year_end THEN RAISE EXCEPTION 'Remark date outside academic year'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.academic_class_id <> OLD.academic_class_id OR NEW.student_id <> OLD.student_id OR NEW.enrollment_id <> OLD.enrollment_id OR NEW.author_id <> OLD.author_id OR NEW.on_date <> OLD.on_date THEN
      RAISE EXCEPTION 'Remark identity and historical context cannot be rewritten';
    END IF;
    IF NEW.status = 'approved' AND (NEW.content <> OLD.content OR NEW.category <> OLD.category OR NEW.parent_visible <> OLD.parent_visible OR NEW.student_visible <> OLD.student_visible) THEN
      RAISE EXCEPTION 'Changed remarks require fresh approval';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER remark_integrity BEFORE INSERT OR UPDATE ON remarks FOR EACH ROW EXECUTE FUNCTION remark_record_guard();
--> statement-breakpoint
CREATE FUNCTION enrollment_remark_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM remarks WHERE enrollment_id = NEW.id AND (on_date < NEW.starts_on OR (NEW.ends_on IS NOT NULL AND on_date > NEW.ends_on))) THEN
    RAISE EXCEPTION 'Enrollment date change would invalidate remark history';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER preserve_remark_history BEFORE UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION enrollment_remark_history_guard();
