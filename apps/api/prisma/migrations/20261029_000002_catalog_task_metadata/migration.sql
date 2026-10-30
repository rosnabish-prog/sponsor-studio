ALTER TABLE "Task" ADD COLUMN "metadata" JSONB;

CREATE TABLE "WorkspaceCatalog" (
    "workspaceId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceCatalog_pkey" PRIMARY KEY ("workspaceId")
);

ALTER TABLE "WorkspaceCatalog" ADD CONSTRAINT "WorkspaceCatalog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
