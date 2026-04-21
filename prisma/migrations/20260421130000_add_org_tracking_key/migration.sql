-- ========================================================
-- B5: Tracking snippet
-- Добавляем trackingKey в Organization.
-- ========================================================

-- 1. Добавляем колонку nullable
ALTER TABLE "Organization" ADD COLUMN "trackingKey" TEXT;

-- 2. Бэкфилл существующих строк случайным hex-ключом (32 символа).
-- Используем md5(random || clock_timestamp) — не требует pgcrypto.
UPDATE "Organization"
SET "trackingKey" = md5(random()::text || clock_timestamp()::text)
WHERE "trackingKey" IS NULL;

-- 3. NOT NULL + unique
ALTER TABLE "Organization" ALTER COLUMN "trackingKey" SET NOT NULL;
CREATE UNIQUE INDEX "Organization_trackingKey_key" ON "Organization"("trackingKey");
CREATE INDEX "Organization_trackingKey_idx" ON "Organization"("trackingKey");
