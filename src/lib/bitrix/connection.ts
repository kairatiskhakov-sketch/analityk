import { decrypt } from "@/lib/crypto";
import { buildBitrix24BaseUrl } from "@/lib/integrations/bitrix24/client";
import { DEFAULT_ORG_ID, resolveOrgId } from "@/lib/org/context";
import { prisma } from "@/lib/prisma";
import type { CrmConnection } from "@prisma/client";

/**
 * Активное подключение Bitrix24 для указанной org.
 * Если orgId не передан — резолвим из текущей NextAuth-сессии,
 * на случай вызовов вне сессии (webhook/cron) есть фоллбэк на DEFAULT_ORG_ID.
 */
export async function getActiveBitrixConnection(
  orgId?: string,
): Promise<CrmConnection | null> {
  const effectiveOrgId = orgId ?? (await resolveOrgId()) ?? DEFAULT_ORG_ID;
  return prisma.crmConnection.findFirst({
    where: { isActive: true, crmType: "bitrix24", orgId: effectiveOrgId },
  });
}

/**
 * Base URL вебхука для {@link BitrixAPI}: https://portal/rest/1/token/
 */
export function getBitrixWebhookBaseUrl(conn: CrmConnection): string | null {
  if (conn.crmType !== "bitrix24") return null;
  if (!conn.bitrixDomain || !conn.bitrixUserId || !conn.bitrixWebhookToken) {
    return null;
  }
  const token = decrypt(conn.bitrixWebhookToken);
  return buildBitrix24BaseUrl({
    domain: conn.bitrixDomain,
    userId: conn.bitrixUserId,
    webhookToken: token,
  });
}
