import { decrypt } from "@/lib/crypto";
import { jsonError, jsonOk } from "@/lib/http/json";
import { createTelegramBot } from "@/lib/integrations/telegram/bot";
import { resolveOrgId } from "@/lib/org/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      connectionId?: string;
      chatId?: string;
    };
    if (!body.connectionId?.trim() || !body.chatId?.trim()) {
      return jsonError("Нужны connectionId и chatId");
    }

    const orgId = await resolveOrgId();
    const conn = await prisma.telegramConnection.findUnique({
      where: { id: body.connectionId },
    });
    if (!conn?.isActive || conn.orgId !== orgId) {
      return jsonError("Подключение не найдено или выключено", 400);
    }

    const token = decrypt(conn.botToken);
    if (!token) {
      return jsonError("Токен бота пуст", 400);
    }

    const bot = createTelegramBot(token);
    await bot.sendMessage(
      body.chatId,
      "✅ Тест: бот CRM Sales Analytics отвечает.",
    );

    return jsonOk({ sent: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка отправки";
    return jsonError(msg, 500);
  }
}
