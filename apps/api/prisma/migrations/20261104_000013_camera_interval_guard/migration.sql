-- Protect all camera footage, not just open-ended LIVE rows.
-- A PostgreSQL exclusion constraint cannot be installed safely while legacy
-- overlaps remain. This trigger guards new writes immediately while those
-- historical rows are recovered using the audited camera repair action.
CREATE OR REPLACE FUNCTION "prevent_overlapping_camera_intervals"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."kind" <> 'CAMERA' OR NEW."deletedAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Serialize writers per task, even for direct SQL operations that bypass
  -- the application service. API writes acquire the same row lock first.
  PERFORM 1 FROM "Task" WHERE "id" = NEW."taskId" FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM "Annotation" existing
    WHERE existing."taskId" = NEW."taskId"
      AND existing."kind" = 'CAMERA'
      AND existing."deletedAt" IS NULL
      AND existing."id" <> NEW."id"
      AND existing."start" < COALESCE(NEW."end", 'Infinity'::float8)
      AND COALESCE(existing."end", 'Infinity'::float8) > NEW."start"
  ) THEN
    RAISE EXCEPTION 'Only one camera angle can exist at a time (overlapping interval)'
      USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "camera_interval_nonoverlap" ON "Annotation";
CREATE TRIGGER "camera_interval_nonoverlap"
BEFORE INSERT OR UPDATE OF "start", "end", "deletedAt", "kind", "taskId" ON "Annotation"
FOR EACH ROW EXECUTE FUNCTION "prevent_overlapping_camera_intervals"();
