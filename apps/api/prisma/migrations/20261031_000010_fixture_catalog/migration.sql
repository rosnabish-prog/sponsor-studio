-- Persist the public match catalog independently of tasks and annotations.
CREATE TABLE "FixtureSnapshot" (
    "id" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "finalized" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixtureSnapshot_pkey" PRIMARY KEY ("id")
);
