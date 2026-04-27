/**
 * Платформенный audit log (PlatformAudit).
 *
 * Best-effort write: ошибка записи никогда не валит основную операцию.
 * PII в details не пишем (email цели уже есть в User-таблице, берём оттуда).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger, errorFields } from "@/lib/log/logger";

const log = createLogger("admin.audit");

export const PlatformAuditAction = {
  USER_REGISTERED: "user.registered",
  USER_APPROVED: "user.approved",
  USER_BLOCKED: "user.blocked",
  USER_UNBLOCKED: "user.unblocked",
  ADMIN_GRANTED: "admin.granted",
  ADMIN_REVOKED: "admin.revoked",
} as const;

export type PlatformAuditActionName =
  (typeof PlatformAuditAction)[keyof typeof PlatformAuditAction];

export type PlatformAuditInput = {
  actorId?: string | null;
  action: PlatformAuditActionName | string;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
};

export async function writePlatformAudit(
  input: PlatformAuditInput,
): Promise<void> {
  try {
    await prisma.platformAudit.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        targetId: input.targetId ?? null,
        details:
          input.details == null
            ? Prisma.JsonNull
            : (input.details as Prisma.InputJsonValue),
      },
    });
  } catch (e) {
    log.error("write failed", {
      action: input.action,
      ...errorFields(e),
    });
  }
}
