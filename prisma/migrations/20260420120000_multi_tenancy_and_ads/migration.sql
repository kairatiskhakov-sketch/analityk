-- ========================================================
-- Multi-tenancy + Ads integrations
--
-- Стратегия:
-- 1. Создаём Organization/OrgMember, enums
-- 2. Добавляем orgId NULLABLE во все тенантные таблицы
-- 3. Бэкфилл: создаём дефолтную org "My Company", привязываем все существующие
--    записи к ней и всех существующих пользователей как OWNER
-- 4. Обновляем @@unique (дропаем старые, создаём с orgId)
-- 5. Добавляем Ads / Attribution модели
-- orgId остаётся NULLABLE, чтобы старый webhook-код не падал.
-- Перевод в NOT NULL — отдельной миграцией позже.
-- ========================================================

-- ========== Enums ==========
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'VIEWER');
CREATE TYPE "AdPlatform" AS ENUM ('META', 'TIKTOK', 'GOOGLE');
CREATE TYPE "AdConnectionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'ERROR', 'DISCONNECTED');

-- ========== Organization ==========
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "Organization_slug_idx" ON "Organization"("slug");

-- ========== OrgMember ==========
CREATE TABLE "OrgMember" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'VIEWER',
    "invitedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrgMember_orgId_userId_key" ON "OrgMember"("orgId", "userId");
CREATE INDEX "OrgMember_userId_idx" ON "OrgMember"("userId");
CREATE INDEX "OrgMember_orgId_idx" ON "OrgMember"("orgId");
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ========== User: currentOrgId ==========
ALTER TABLE "User" ADD COLUMN "currentOrgId" TEXT;

-- ========== Default organization + backfill ==========
-- Создаём дефолтную org с фиксированным id, чтобы бэкфилл был идемпотентным
INSERT INTO "Organization" ("id", "name", "slug", "plan", "createdAt", "updatedAt")
VALUES ('org_default_0001', 'My Company', 'my-company', 'pro', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Все существующие пользователи становятся OWNER в дефолтной org
INSERT INTO "OrgMember" ("id", "orgId", "userId", "role", "createdAt")
SELECT 'om_' || u."id", 'org_default_0001', u."id", 'OWNER', CURRENT_TIMESTAMP
FROM "User" u
ON CONFLICT ("orgId", "userId") DO NOTHING;

-- Устанавливаем currentOrgId для всех существующих пользователей
UPDATE "User" SET "currentOrgId" = 'org_default_0001' WHERE "currentOrgId" IS NULL;

-- ========== Добавляем orgId в тенантные таблицы (NULLABLE) ==========
ALTER TABLE "CrmConnection"    ADD COLUMN "orgId" TEXT;
ALTER TABLE "CrmDictionary"    ADD COLUMN "orgId" TEXT;
ALTER TABLE "GoogleConnection" ADD COLUMN "orgId" TEXT;
ALTER TABLE "TelegramConnection" ADD COLUMN "orgId" TEXT;
ALTER TABLE "Manager"          ADD COLUMN "orgId" TEXT;
ALTER TABLE "PlanTarget"       ADD COLUMN "orgId" TEXT;
ALTER TABLE "SalesPlan"        ADD COLUMN "orgId" TEXT;
ALTER TABLE "StageConfig"      ADD COLUMN "orgId" TEXT;
ALTER TABLE "DashboardModule"  ADD COLUMN "orgId" TEXT;

-- Бэкфилл всех существующих записей в дефолтную org
UPDATE "CrmConnection"      SET "orgId" = 'org_default_0001' WHERE "orgId" IS NULL;
UPDATE "CrmDictionary"      SET "orgId" = 'org_default_0001' WHERE "orgId" IS NULL;
UPDATE "GoogleConnection"   SET "orgId" = 'org_default_0001' WHERE "orgId" IS NULL;
UPDATE "TelegramConnection" SET "orgId" = 'org_default_0001' WHERE "orgId" IS NULL;
UPDATE "Manager"            SET "orgId" = 'org_default_0001' WHERE "orgId" IS NULL;
UPDATE "PlanTarget"         SET "orgId" = 'org_default_0001' WHERE "orgId" IS NULL;
UPDATE "SalesPlan"          SET "orgId" = 'org_default_0001' WHERE "orgId" IS NULL;
UPDATE "StageConfig"        SET "orgId" = 'org_default_0001' WHERE "orgId" IS NULL;

-- ========== Обновляем unique constraints: добавляем orgId ==========

-- CrmDictionary
ALTER TABLE "CrmDictionary" DROP CONSTRAINT IF EXISTS "CrmDictionary_crmType_entityId_externalId_key";
DROP INDEX IF EXISTS "CrmDictionary_crmType_entityId_externalId_key";
DROP INDEX IF EXISTS "CrmDictionary_crmType_entityId_idx";
CREATE UNIQUE INDEX "CrmDictionary_orgId_crmType_entityId_externalId_key"
  ON "CrmDictionary"("orgId", "crmType", "entityId", "externalId");
CREATE INDEX "CrmDictionary_orgId_crmType_entityId_idx"
  ON "CrmDictionary"("orgId", "crmType", "entityId");

-- Manager
ALTER TABLE "Manager" DROP CONSTRAINT IF EXISTS "Manager_externalId_crmType_key";
DROP INDEX IF EXISTS "Manager_externalId_crmType_key";
CREATE UNIQUE INDEX "Manager_orgId_externalId_crmType_key"
  ON "Manager"("orgId", "externalId", "crmType");
CREATE INDEX "Manager_orgId_idx" ON "Manager"("orgId");

-- PlanTarget
ALTER TABLE "PlanTarget" DROP CONSTRAINT IF EXISTS "PlanTarget_period_periodType_managerId_key";
DROP INDEX IF EXISTS "PlanTarget_period_periodType_managerId_key";
CREATE UNIQUE INDEX "PlanTarget_orgId_period_periodType_managerId_key"
  ON "PlanTarget"("orgId", "period", "periodType", "managerId");
CREATE INDEX "PlanTarget_orgId_idx" ON "PlanTarget"("orgId");

-- StageConfig
ALTER TABLE "StageConfig" DROP CONSTRAINT IF EXISTS "StageConfig_externalId_crmType_key";
DROP INDEX IF EXISTS "StageConfig_externalId_crmType_key";
CREATE UNIQUE INDEX "StageConfig_orgId_externalId_crmType_key"
  ON "StageConfig"("orgId", "externalId", "crmType");
CREATE INDEX "StageConfig_orgId_idx" ON "StageConfig"("orgId");

-- Простые индексы для orgId
CREATE INDEX "CrmConnection_orgId_idx"    ON "CrmConnection"("orgId");
CREATE INDEX "CrmConnection_orgId_isActive_idx" ON "CrmConnection"("orgId", "isActive");
CREATE INDEX "GoogleConnection_orgId_idx" ON "GoogleConnection"("orgId");
CREATE INDEX "TelegramConnection_orgId_idx" ON "TelegramConnection"("orgId");
CREATE INDEX "SalesPlan_orgId_idx"        ON "SalesPlan"("orgId");
CREATE INDEX "DashboardModule_orgId_idx"  ON "DashboardModule"("orgId");

-- FK constraints
ALTER TABLE "CrmConnection"      ADD CONSTRAINT "CrmConnection_orgId_fkey"      FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmDictionary"      ADD CONSTRAINT "CrmDictionary_orgId_fkey"      FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoogleConnection"   ADD CONSTRAINT "GoogleConnection_orgId_fkey"   FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramConnection" ADD CONSTRAINT "TelegramConnection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Manager"            ADD CONSTRAINT "Manager_orgId_fkey"            FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanTarget"         ADD CONSTRAINT "PlanTarget_orgId_fkey"         FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesPlan"          ADD CONSTRAINT "SalesPlan_orgId_fkey"          FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StageConfig"        ADD CONSTRAINT "StageConfig_orgId_fkey"        FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ========== Ads ==========
CREATE TABLE "AdConnection" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "extra" TEXT,
    "status" "AdConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdConnection_orgId_platform_accountId_key" ON "AdConnection"("orgId", "platform", "accountId");
CREATE INDEX "AdConnection_orgId_idx" ON "AdConnection"("orgId");
CREATE INDEX "AdConnection_status_idx" ON "AdConnection"("status");
ALTER TABLE "AdConnection" ADD CONSTRAINT "AdConnection_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "objective" TEXT,
    "dailyBudget" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdCampaign_connectionId_externalId_key" ON "AdCampaign"("connectionId", "externalId");
CREATE INDEX "AdCampaign_orgId_idx" ON "AdCampaign"("orgId");
CREATE INDEX "AdCampaign_platform_idx" ON "AdCampaign"("platform");
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "AdConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AdInsightsDaily" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdInsightsDaily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdInsightsDaily_campaignId_date_key" ON "AdInsightsDaily"("campaignId", "date");
CREATE INDEX "AdInsightsDaily_orgId_date_idx" ON "AdInsightsDaily"("orgId", "date");
CREATE INDEX "AdInsightsDaily_orgId_platform_date_idx" ON "AdInsightsDaily"("orgId", "platform", "date");
ALTER TABLE "AdInsightsDaily" ADD CONSTRAINT "AdInsightsDaily_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "AdConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdInsightsDaily" ADD CONSTRAINT "AdInsightsDaily_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ========== Attribution ==========
CREATE TABLE "TrackingTouch" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "landingUrl" TEXT,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "fbclid" TEXT,
    "ttclid" TEXT,
    "gclid" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrackingTouch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TrackingTouch_orgId_visitorId_idx" ON "TrackingTouch"("orgId", "visitorId");
CREATE INDEX "TrackingTouch_orgId_createdAt_idx" ON "TrackingTouch"("orgId", "createdAt");
CREATE INDEX "TrackingTouch_fbclid_idx" ON "TrackingTouch"("fbclid");
CREATE INDEX "TrackingTouch_ttclid_idx" ON "TrackingTouch"("ttclid");
CREATE INDEX "TrackingTouch_gclid_idx"  ON "TrackingTouch"("gclid");

CREATE TABLE "LeadAttribution" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "crmDealId" TEXT NOT NULL,
    "crmType" TEXT NOT NULL,
    "touchId" TEXT,
    "campaignId" TEXT,
    "platform" "AdPlatform",
    "utmSource" TEXT,
    "utmCampaign" TEXT,
    "clickId" TEXT,
    "matchedBy" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeadAttribution_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LeadAttribution_orgId_crmDealId_crmType_key" ON "LeadAttribution"("orgId", "crmDealId", "crmType");
CREATE INDEX "LeadAttribution_orgId_campaignId_idx" ON "LeadAttribution"("orgId", "campaignId");
CREATE INDEX "LeadAttribution_orgId_platform_idx"   ON "LeadAttribution"("orgId", "platform");
