import { encrypt } from "@/lib/crypto";
import { jsonError, jsonOk } from "@/lib/http/json";
import { normalizeAmoSubdomain } from "@/lib/integrations/amocrm/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Сохраняет subdomain + OAuth client_id/client_secret (зашифрован) перед редиректом на /api/crm/amo/auth.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      connectionId?: string;
      subdomain: string;
      clientId: string;
      clientSecret: string;
    };

    if (!body.subdomain?.trim() || !body.clientId?.trim() || !body.clientSecret?.trim()) {
      return jsonError("Нужны subdomain, clientId, clientSecret");
    }

    const subdomain = normalizeAmoSubdomain(body.subdomain);
    const clientId = body.clientId.trim();
    const encSecret = encrypt(body.clientSecret.trim());

    if (body.connectionId) {
      const updated = await prisma.crmConnection.update({
        where: { id: body.connectionId },
        data: {
          crmType: "amocrm",
          amoSubdomain: subdomain,
          amoClientId: clientId,
          amoClientSecret: encSecret,
        },
      });
      return jsonOk({ connection: updated });
    }

    const created = await prisma.crmConnection.create({
      data: {
        crmType: "amocrm",
        isActive: false,
        amoSubdomain: subdomain,
        amoClientId: clientId,
        amoClientSecret: encSecret,
      },
    });
    return jsonOk({ connection: created });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
