-- One-time administrator-issued passwords replace email recovery links.
ALTER TABLE "User" ADD COLUMN "passwordChangeRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "temporaryPasswordExpiresAt" TIMESTAMP(3);

-- Previous email recovery tokens are no longer valid or needed.
DROP TABLE IF EXISTS "PasswordResetToken";
