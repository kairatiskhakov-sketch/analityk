import { encrypt } from "@/lib/crypto";
import { jsonError, jsonOk } from "@/lib/http/json";
import { normalizeBitrixDomain } from "@/lib/integrations/bitrix24/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Body = {
  connectionId?: string;
  domain: string;
  userId: string;
  webhookToken: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.domain?.trim() || !body.userId?.trim() || !body.webhookToken?.trim()) {
      return jsonError("Нужны domain, userId, webhookToken");
    }

    const domain = normalizeBitrixDomain(body.domain);
    const enc = encrypt(body.webhookToken.trim());

    if (body.connectionId) {
      const updated = await prisma.crmConnection.update({
        where: { id: body.connectionId },
        data: {
          crmType: "bitrix24",
          isActive: true,
          bitrixDomain: domain,
          bitrixUserId: body.userId.trim(),
          bitrixWebhookToken: enc,
        },
      });
      return jsonOk({ connection: updated });
    }

    const created = await prisma.crmConnection.create({
      data: {
        crmType: "bitrix24",
        isActive: true,
        bitrixDomain: domain,
        bitrixUserId: body.userId.trim(),
        bitrixWebhookToken: enc,
      },
    });
    return jsonOk({ connection: created });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
