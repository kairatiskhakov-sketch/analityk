import { jsonError, jsonOk } from "@/lib/http/json";
import {
  extractBitrixAuthDomain,
  parseBitrixWebhookBody,
  verifyBitrixWebhookPortalDomain,
} from "@/lib/integrations/bitrix24/webhook";
import { syncBitrix24Connection } from "@/lib/integrations/bitrix24/sync";
import { attributeBitrixEntity } from "@/lib/integrations/bitrix24/attribution";
import { prisma } from "@/lib/prisma";
import { createLogger, errorFields, shortId } from "@/lib/log/logger";

export const dynamic = "force-dynamic";

/** Какую сущность трогаем по имени события Bitrix24. */
function eventToEntityType(event: string): "deal" | "lead" | null {
  const e = event.toUpperCase();
  if (e.includes("DEAL")) return "deal";
  if (e.includes("LEAD")) return "lead";
  return null;
}

export async function POST(req: Request) {
  const reqId = shortId();
  const log = createLogger("webhook.bitrix", { reqId });
  const t0 = Date.now();

  try {
    const body = (await req.json()) as unknown;
    const portalDomain = extractBitrixAuthDomain(body);

    if (!portalDomain) {
      log.warn("missing portal domain", { durMs: Date.now() - t0 });
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
      log.warn("connection not found", { portalDomain, durMs: Date.now() - t0 });
      return jsonError("Подключение Bitrix24 не найдено по домену", 404);
    }

    const parsed = parseBitrixWebhookBody(body);
    log.info("received", {
      connectionId: conn.id,
      orgId: conn.orgId,
      event: parsed.event,
      entityId: parsed.entityId,
    });

    let sync: Awaited<ReturnType<typeof syncBitrix24Connection>> | undefined;
    try {
      sync = await syncBitrix24Connection(conn.id);
    } catch (e) {
      log.error("sync failed", { connectionId: conn.id, ...errorFields(e) });
      sync = undefined;
    }

    // Атрибуция: если пришло событие по deal/lead и есть entityId —
    // тянем сущность из Bitrix и матчим по tracking-полям.
    let attribution: Awaited<ReturnType<typeof attributeBitrixEntity>> = null;
    const entityType = eventToEntityType(parsed.event);
    if (entityType && parsed.entityId) {
      try {
        attribution = await attributeBitrixEntity(
          conn.id,
          entityType,
          parsed.entityId,
        );
      } catch (e) {
        log.error("attribution failed", {
          connectionId: conn.id,
          entityType,
          entityId: parsed.entityId,
          ...errorFields(e),
        });
        attribution = null;
      }
    }

    log.info("done", {
      connectionId: conn.id,
      event: parsed.event,
      synced: Boolean(sync),
      attributed: Boolean(attribution?.touchId),
      durMs: Date.now() - t0,
    });

    return jsonOk({
      received: true,
      event: parsed.event,
      entityId: parsed.entityId,
      sync,
      attribution,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    log.error("unhandled", { durMs: Date.now() - t0, ...errorFields(e) });
    return jsonError(msg, 500);
  }
}
