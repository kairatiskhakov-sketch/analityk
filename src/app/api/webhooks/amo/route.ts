import { decrypt } from "@/lib/crypto";
import { jsonError, jsonOk } from "@/lib/http/json";
import { normalizeAmoSubdomain } from "@/lib/integrations/amocrm/client";
import {
  parseAmoWebhookPayload,
  verifyAmoWebhookSignature,
} from "@/lib/integrations/amocrm/webhook";
import { syncAmoConnection } from "@/lib/integrations/amocrm/sync";
import { attributeAmoLead } from "@/lib/integrations/amocrm/attribution";
import { prisma } from "@/lib/prisma";
import { createLogger, errorFields, shortId } from "@/lib/log/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const reqId = shortId();
  const log = createLogger("webhook.amo", { reqId });
  const t0 = Date.now();

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature");

    let body: unknown;
    try {
      body = JSON.parse(rawBody) as unknown;
    } catch {
      log.warn("bad json", { durMs: Date.now() - t0 });
      return jsonError("Нужен JSON", 400);
    }

    const parsed = parseAmoWebhookPayload(body);
    const subdomain = parsed.accountSubdomain;

    if (!subdomain) {
      log.warn("missing subdomain", { durMs: Date.now() - t0 });
      return jsonError("В теле нет account.subdomain", 400);
    }

    const conn = await prisma.crmConnection.findFirst({
      where: {
        crmType: "amocrm",
        isActive: true,
        amoSubdomain: normalizeAmoSubdomain(subdomain),
      },
    });

    if (!conn?.amoClientSecret) {
      log.warn("connection not found", { subdomain, durMs: Date.now() - t0 });
      return jsonError("Подключение AmoCRM не найдено", 404);
    }

    const secret = decrypt(conn.amoClientSecret);
    if (!verifyAmoWebhookSignature(rawBody, signature, secret)) {
      log.warn("bad signature", {
        connectionId: conn.id,
        subdomain,
        durMs: Date.now() - t0,
      });
      return jsonError("Неверная подпись X-Signature", 401);
    }

    log.info("received", {
      connectionId: conn.id,
      orgId: conn.orgId,
      subdomain,
      leadsAdd: parsed.leadsAdd.length,
      leadsUpdate: parsed.leadsUpdate.length,
    });

    let sync: Awaited<ReturnType<typeof syncAmoConnection>> | undefined;
    try {
      sync = await syncAmoConnection(conn.id);
    } catch (e) {
      log.error("sync failed", { connectionId: conn.id, ...errorFields(e) });
      sync = undefined;
    }

    // Атрибуция по всем пришедшим lead id (add + update), best-effort.
    const leadIds = [...parsed.leadsAdd, ...parsed.leadsUpdate];
    const attributed: number[] = [];
    let attribFailures = 0;
    for (const leadId of leadIds) {
      try {
        const r = await attributeAmoLead(conn.id, leadId);
        if (r) attributed.push(leadId);
      } catch (e) {
        attribFailures++;
        log.error("attribution failed", {
          connectionId: conn.id,
          leadId,
          ...errorFields(e),
        });
      }
    }

    log.info("done", {
      connectionId: conn.id,
      leadsSeen: leadIds.length,
      attributed: attributed.length,
      attribFailures,
      synced: Boolean(sync),
      durMs: Date.now() - t0,
    });

    return jsonOk({
      received: true,
      leadsAdd: parsed.leadsAdd.length,
      leadsUpdate: parsed.leadsUpdate.length,
      attributed: attributed.length,
      sync,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    log.error("unhandled", { durMs: Date.now() - t0, ...errorFields(e) });
    return jsonError(msg, 500);
  }
}
