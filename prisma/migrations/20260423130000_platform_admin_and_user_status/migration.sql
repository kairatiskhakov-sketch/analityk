-- ========================================================
-- Платформенная админка: статусы пользователей + super-admin флаг +
-- журнал аудита super-admin'ов.
--
-- Все существующие юзеры grandfather'ятся как ACTIVE (они уже пользуются
-- продуктом, блокировать их мы не хотим). DEFAULT для новых → PENDING.
-- ========================================================

-- 1. Enum статуса
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'BLOCKED');

-- 2. Колонки User. Исходно status ставим 'ACTIVE', чтобы существующие
--    пользователи не вылетели на "ждите одобрения". Потом меняем DEFAULT
--    на 'PENDING' — для регистраций с этого момента.
ALTER TABLE "User"
  ADD COLUMN "status"          "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "isPlatformAdmin" BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN "lastLoginAt"     TIMESTAMP(3),
  ADD COLUMN "approvedAt"      TIMESTAMP(3),
  ADD COLUMN "approvedById"    TEXT,
  ADD COLUMN "blockedAt"       TIMESTAMP(3),
  ADD COLUMN "blockedById"     TEXT,
  ADD COLUMN "blockReason"     TEXT;

-- 3. Grandfather: все существующие юзеры — одобрены ретро-активно
UPDATE "User" SET "approvedAt" = "createdAt" WHERE "approvedAt" IS NULL;

-- 4. С этой секунды новые регистрации → PENDING
ALTER TABLE "User" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- 5. Индексы
CREATE INDEX "User_status_idx"          ON "User"("status");
CREATE INDEX "User_isPlatformAdmin_idx" ON "User"("isPlatformAdmin");

-- 6. PlatformAudit
CREATE TABLE "PlatformAudit" (
  "id"        TEXT         NOT NULL,
  "actorId"   TEXT,
  "action"    TEXT         NOT NULL,
  "targetId"  TEXT,
  "details"   JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformAudit_createdAt_idx" ON "PlatformAudit"("createdAt");
CREATE INDEX "PlatformAudit_action_idx"    ON "PlatformAudit"("action");
CREATE INDEX "PlatformAudit_targetId_idx"  ON "PlatformAudit"("targetId");
CREATE INDEX "PlatformAudit_actorId_idx"   ON "PlatformAudit"("actorId");
