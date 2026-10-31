-- Saved annotations are recoverable. No ordinary edit physically deletes a row.
ALTER TABLE "Annotation" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Annotation" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Annotation" ADD COLUMN "deletedBy" UUID;

CREATE INDEX "Annotation_taskId_deletedAt_idx" ON "Annotation"("taskId", "deletedAt");

CREATE TABLE "AnnotationRevision" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "annotationId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "action" VARCHAR(30) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnnotationRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnnotationRevision_annotationId_version_key" ON "AnnotationRevision"("annotationId", "version");
CREATE INDEX "AnnotationRevision_taskId_createdAt_idx" ON "AnnotationRevision"("taskId", "createdAt");
CREATE INDEX "AnnotationRevision_taskId_annotationId_version_idx" ON "AnnotationRevision"("taskId", "annotationId", "version");
ALTER TABLE "AnnotationRevision" ADD CONSTRAINT "AnnotationRevision_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill version 1 for every annotation that predates history tracking.
INSERT INTO "AnnotationRevision" (
  "id", "taskId", "annotationId", "version", "action", "snapshot", "actorId", "createdAt"
)
SELECT gen_random_uuid(), a."taskId", a."id", 1, 'BASELINE',
  jsonb_build_object('kind', a."kind", 'labelId', a."labelId", 'start', a."start", 'end', a."end",
    'placement', a."placement", 'quality', a."quality", 'createdBy', a."createdBy",
    'createdAt', a."createdAt", 'deletedAt', NULL),
  a."createdBy", a."updatedAt"
FROM "Annotation" a;

-- Soft-deleted LIVE rows no longer count against active-annotation uniqueness.
DROP INDEX IF EXISTS "Annotation_one_active_tag";
DROP INDEX IF EXISTS "Annotation_one_active_camera";
CREATE UNIQUE INDEX "Annotation_one_active_tag" ON "Annotation" ("taskId", "kind", "labelId")
WHERE "deletedAt" IS NULL AND "end" IS NULL AND "kind" IN ('SPONSOR', 'EVENT');
CREATE UNIQUE INDEX "Annotation_one_active_camera" ON "Annotation" ("taskId")
WHERE "deletedAt" IS NULL AND "end" IS NULL AND "kind" = 'CAMERA';
