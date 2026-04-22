-- ========================================================
-- Org invites: приглашения в организацию по токену.
-- Отправляются пользователю, которого ещё нет в системе.
-- ========================================================

CREATE TABLE "OrgInvite" (
  "id"         TEXT NOT NULL,
  "orgId"      TEXT NOT NULL,
  "email"      TEXT NOT NULL,
  "role"       "OrgRole" NOT NULL DEFAULT 'VIEWER',
  "token"      TEXT NOT NULL,
  "invitedBy"  TEXT,
  "acceptedBy" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt"  TIMESTAMP(3),
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OrgInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgInvite_token_key" ON "OrgInvite"("token");
CREATE INDEX "OrgInvite_orgId_idx" ON "OrgInvite"("orgId");
CREATE INDEX "OrgInvite_email_idx" ON "OrgInvite"("email");
CREATE INDEX "OrgInvite_token_idx" ON "OrgInvite"("token");

ALTER TABLE "OrgInvite"
  ADD CONSTRAINT "OrgInvite_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
