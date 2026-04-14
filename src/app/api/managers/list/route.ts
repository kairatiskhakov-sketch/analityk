import { fetchManagersCached } from "@/lib/bitrix/cache";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Менеджеры для фильтров: из Bitrix24 (live), при отсутствии вебхука — кеш из БД.
 */
export async function GET() {
  try {
    const conn = await getActiveBitrixConnection();
    const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
    if (url) {
      try {
        const list = await fetchManagersCached(url);
        return jsonOk({
          managers: list.map((m) => ({
            id: m.id,
            name: m.name,
            crmType: "bitrix24" as const,
          })),
        });
      } catch {
        /* fallback DB */
      }
    }

    const managers = await prisma.manager.findMany({
      where: { crmType: "bitrix24" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, crmType: true, externalId: true },
    });
    return jsonOk({
      managers: managers.map((m) => ({
        id: m.externalId,
        name: m.name,
        crmType: m.crmType,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
