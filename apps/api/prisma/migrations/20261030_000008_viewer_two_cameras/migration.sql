-- VIEWER can read reports and export annotations, but cannot edit tasks.
ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'VIEWER';

-- Distinct active camera labels may coexist; application transactions enforce
-- the upper limit of two while this unique index forbids duplicate labels.
DROP INDEX IF EXISTS "Annotation_one_active_camera";
CREATE UNIQUE INDEX "Annotation_one_active_camera_label" ON "Annotation" ("taskId", "labelId")
WHERE "end" IS NULL AND "kind" = 'CAMERA';
