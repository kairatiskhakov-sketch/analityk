-- ========================================================
-- orgId → NOT NULL в тенантных таблицах.
--
-- Предыдущая миграция (20260420120000_multi_tenancy_and_ads) добавила
-- orgId NULLABLE и сделала бэкфилл на 'org_default_0001'. С тех пор все
-- новые строки создаются с явным orgId (resolveOrgId + DEFAULT_ORG_ID
-- fallback). Теперь можем ужесточить схему.
--
-- Защитный повторный бэкфилл на случай строк, появившихся между
-- миграциями с NULL orgId (например, старый webhook-код).
--
-- DashboardModule намеренно остаётся nullable — это per-user настройка,
-- org-привязка опциональна.
-- ========================================================

-- 1. Defensive backfill: любые оставшиеся NULL → дефолтная org
UPDATE "CrmConnection"      SET "orgId" = 'org_default_0001' WHERE "orgId" IS NULL;
UPDATE "CrmDictionary"      SET "orgId" = 'org_default_0001' WHERE "orgId" IS NULL;
UPDATE "GoogleConnection"   SET "orgId" = 'org_default_0001' WHERE "orgId" IS NULL;
UPDATE "TelegramConnection" SET "orgId" = 'org_default_0001' WHERE "orgId" IS NULL;
UPDATE "Manager"            SET "orgId" = 'org_default_0001' WHERE "orgId" IS NULL;
UPDATE "PlanTarget"         SET "orgId" = 'org_default_0001' WHERE "orgId" IS NULL;
UPDATE "SalesPlan"          SET "orgId" = 'org_default_0001' WHERE "orgId" IS NULL;
UPDATE "StageConfig"        SET "orgId" = 'org_default_0001' WHERE "orgId" IS NULL;

-- 2. SET NOT NULL
ALTER TABLE "CrmConnection"      ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "CrmDictionary"      ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "GoogleConnection"   ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "TelegramConnection" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Manager"            ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "PlanTarget"         ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "SalesPlan"          ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "StageConfig"        ALTER COLUMN "orgId" SET NOT NULL;
