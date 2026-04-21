import { jsonError, jsonOk } from "@/lib/http/json";
import {
  extractBitrixAuthDomain,
  parseBitrixWebhookBody,
  verifyBitrixWebhookPortalDomain,
} from "@/lib/integrations/bitrix24/webhook";
import { syncBitrix24Connection } from "@/lib/integrations/bitrix24/sync";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as unknown;
    const portalDomain = extractBitrixAuthDomain(body);

    if (!portalDomain) {
      return jsonError("В теле webhook отсутствует portal domain", 400);
    }

    const connections = await prisma.crmConnection.findMany({
      where: { crmType: "bitrix24", isActive: true },
    });

    const conn = connections.find((c) =>
      c.bitrixDomain
        ? verifyBitrixWebhookPortalDomain(portalDomain, c.bitrixDomain)
        : false,
    );

    if (!conn) {
      return jsonError("Подключение Bitrix24 не найдено по домену", 404);
    }

    const parsed = parseBitrixWebhookBody(body);

    let sync: Awaited<ReturnType<typeof syncBitrix24Connection>> | undefined;
    try {
      sync = await syncBitrix24Connection(conn.id);
    } catch {
      sync = undefined;
    }

    return jsonOk({
      received: true,
      event: parsed.event,
      entityId: parsed.entityId,
      sync,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
