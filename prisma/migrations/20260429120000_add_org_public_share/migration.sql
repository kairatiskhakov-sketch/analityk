-- Публичная ссылка на просмотр аналитики без логина.
ALTER TABLE "Organization"
  ADD COLUMN "publicShareToken"    TEXT,
  ADD COLUMN "publicShareEnabled"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publicShareSections" TEXT[]  NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX "Organization_publicShareToken_key"
  ON "Organization"("publicShareToken");
