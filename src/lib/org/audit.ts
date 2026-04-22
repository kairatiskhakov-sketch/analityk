/**
 * Audit log helper — запись события в OrgAudit.
 *
 * Принципы:
 *  - Best-effort: ошибка записи никогда не валит основную бизнес-операцию.
 *  - Никакого PII в details: имена/email только если они ключевы для события
 *    (приглашения, например). Токены — никогда.
 *  - action — dot.case, enum ниже как const-список для автокомплита.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger, errorFields } from "@/lib/log/logger";

const log = createLogger("org.audit");

export const AuditAction = {
  ORG_RENAMED: "org.renamed",
  ORG_DELETED: "org.deleted",
  MEMBER_ADDED: "member.added",
  MEMBER_ROLE_CHANGED: "member.role_changed",
  MEMBER_REMOVED: "member.removed",
  MEMBER_LEFT: "member.left",
  INVITE_CREATED: "invite.created",
  INVITE_ROLE_CHANGED: "invite.role_changed",
  INVITE_REVOKED: "invite.revoked",
  INVITE_ACCEPTED: "invite.accepted",
  OWNERSHIP_TRANSFERRED: "ownership.transferred",
} as const;

export type AuditActionName = (typeof AuditAction)[keyof typeof AuditAction];

export type AuditInput = {
  orgId: string;
  actorUserId?: string | null;
  action: AuditActionName | string;
  targetUserId?: string | null;
  targetEmail?: string | null;
  targetInviteId?: string | null;
  details?: Record<string, unknown> | null;
};

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.orgAudit.create({
      data: {
        orgId: input.orgId,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        targetUserId: input.targetUserId ?? null,
        targetEmail: input.targetEmail?.toLowerCase() ?? null,
        targetInviteId: input.targetInviteId ?? null,
        details:
          input.details == null
            ? Prisma.JsonNull
            : (input.details as Prisma.InputJsonValue),
      },
    });
  } catch (e) {
    log.error("write failed", {
      orgId: input.orgId,
      action: input.action,
      ...errorFields(e),
    });
  }
}
