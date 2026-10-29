-- Two concurrent analysts must not open duplicate intervals for the same tag.
CREATE UNIQUE INDEX "Annotation_one_active_tag" ON "Annotation" ("taskId", "kind", "labelId")
WHERE "end" IS NULL AND "kind" IN ('SPONSOR', 'EVENT');

-- Only one broadcast camera can be live within a task.
CREATE UNIQUE INDEX "Annotation_one_active_camera" ON "Annotation" ("taskId")
WHERE "end" IS NULL AND "kind" = 'CAMERA';
