-- Migration 000008 created this index without excluding soft-deleted rows.
-- It blocks re-tagging a camera label when a deleted interval still has end NULL.
-- Migration 000009 already provides Annotation_one_active_camera, which enforces
-- one non-deleted LIVE camera per task, so the legacy label index is redundant.
DROP INDEX IF EXISTS "Annotation_one_active_camera_label";
