-- Audit log для операций над организацией.
-- Пишется best-effort из мутирующих эндпоинтов; каскад на Organization.

CREATE TABLE "OrgAudit" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetUserId" TEXT,
    "targetEmail" TEXT,
    "targetInviteId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrgAudit_orgId_createdAt_idx" ON "OrgAudit"("orgId", "createdAt");
CREATE INDEX "OrgAudit_actorUserId_idx" ON "OrgAudit"("actorUserId");
CREATE INDEX "OrgAudit_targetUserId_idx" ON "OrgAudit"("targetUserId");

ALTER TABLE "OrgAudit"
  ADD CONSTRAINT "OrgAudit_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
