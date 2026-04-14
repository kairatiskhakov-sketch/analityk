import { decrypt } from "@/lib/crypto";
import { jsonError, jsonOk } from "@/lib/http/json";
import { createBitrix24Client } from "@/lib/integrations/bitrix24/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Body = { connectionId?: string };

/** Проверка соединения по сохранённым в БД учётным данным (без URL в форме). */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const id = body.connectionId?.trim();
    if (!id) {
      return jsonError("Нужен connectionId", 400);
    }

    const conn = await prisma.crmConnection.findUnique({
      where: { id },
    });
    if (!conn || conn.crmType !== "bitrix24") {
      return jsonError("Подключение не найдено", 404);
    }

    const token = conn.bitrixWebhookToken
      ? decrypt(conn.bitrixWebhookToken)
      : null;
    if (!conn.bitrixDomain || !conn.bitrixUserId || !token) {
      return jsonError("Не заданы данные вебхука", 400);
    }

    const client = createBitrix24Client({
      domain: conn.bitrixDomain,
      userId: conn.bitrixUserId,
      webhookToken: token,
    });
    await client.call("profile", {});

    return jsonOk({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка проверки";
    return jsonError(msg, 400);
  }
}
