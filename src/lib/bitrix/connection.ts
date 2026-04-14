import { decrypt } from "@/lib/crypto";
import { buildBitrix24BaseUrl } from "@/lib/integrations/bitrix24/client";
import { prisma } from "@/lib/prisma";
import type { CrmConnection } from "@prisma/client";

/** Активное подключение Bitrix24 (для прямых запросов к API). */
export async function getActiveBitrixConnection(): Promise<CrmConnection | null> {
  return prisma.crmConnection.findFirst({
    where: { isActive: true, crmType: "bitrix24" },
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
