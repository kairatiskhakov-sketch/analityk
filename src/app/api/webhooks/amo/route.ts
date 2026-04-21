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

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature");

    let body: unknown;
    try {
      body = JSON.parse(rawBody) as unknown;
    } catch {
      return jsonError("Нужен JSON", 400);
    }

    const parsed = parseAmoWebhookPayload(body);
    const subdomain = parsed.accountSubdomain;

    if (!subdomain) {
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
      return jsonError("Подключение AmoCRM не найдено", 404);
    }

    const secret = decrypt(conn.amoClientSecret);
    if (!verifyAmoWebhookSignature(rawBody, signature, secret)) {
      return jsonError("Неверная подпись X-Signature", 401);
    }

    let sync: Awaited<ReturnType<typeof syncAmoConnection>> | undefined;
    try {
      sync = await syncAmoConnection(conn.id);
    } catch {
      sync = undefined;
    }

    // Атрибуция по всем пришедшим lead id (add + update), best-effort.
    const leadIds = [...parsed.leadsAdd, ...parsed.leadsUpdate];
    const attributed: number[] = [];
    for (const leadId of leadIds) {
      try {
        const r = await attributeAmoLead(conn.id, leadId);
        if (r) attributed.push(leadId);
      } catch {
        /* silent */
      }
    }

    return jsonOk({
      received: true,
      leadsAdd: parsed.leadsAdd.length,
      leadsUpdate: parsed.leadsUpdate.length,
      attributed: attributed.length,
      sync,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
