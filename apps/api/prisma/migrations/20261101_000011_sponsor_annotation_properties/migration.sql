-- Non-destructive. Existing sponsor annotations inherit the default clarity
-- when the corresponding property value is absent.
ALTER TABLE "Annotation" ADD COLUMN "properties" JSONB NOT NULL DEFAULT '{}'::jsonb;
