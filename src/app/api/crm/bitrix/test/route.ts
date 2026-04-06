import { decrypt } from "@/lib/crypto";
import { jsonError, jsonOk } from "@/lib/http/json";
import { createBitrix24Client } from "@/lib/integrations/bitrix24/client";
import { bitrixLeadList } from "@/lib/integrations/bitrix24/methods";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { connectionId?: string };
    if (!body.connectionId?.trim()) {
      return jsonError("Нужен connectionId");
    }

    const conn = await prisma.crmConnection.findUnique({
      where: { id: body.connectionId },
    });
    if (!conn || conn.crmType !== "bitrix24") {
      return jsonError("Подключение Bitrix24 не найдено", 404);
    }

    const token = conn.bitrixWebhookToken
      ? decrypt(conn.bitrixWebhookToken)
      : null;
    if (!conn.bitrixDomain || !conn.bitrixUserId || !token) {
      return jsonError("Не настроен вебхук Bitrix24");
    }

    const client = createBitrix24Client({
      domain: conn.bitrixDomain,
      userId: conn.bitrixUserId,
      webhookToken: token,
    });

    const res = await bitrixLeadList(client, {
      select: ["ID", "TITLE"],
      filter: {},
      order: { DATE_CREATE: "DESC" },
      start: 0,
    });

    const sample = (res.result ?? []).slice(0, 1);
    return jsonOk({
      totalHint: res.total,
      next: res.next,
      sample,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
