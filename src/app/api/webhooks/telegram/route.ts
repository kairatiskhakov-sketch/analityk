import { decrypt } from "@/lib/crypto";
import { dispatchTelegramUpdate } from "@/lib/integrations/telegram/commands";
import { verifyTelegramWebhookSecret } from "@/lib/integrations/telegram/bot";
import { prisma } from "@/lib/prisma";
import type TelegramBot from "node-telegram-bot-api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!verifyTelegramWebhookSecret(req)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const connectionId = searchParams.get("connectionId");

    if (!connectionId) {
      return new Response("Missing connectionId", { status: 400 });
    }

    const conn = await prisma.telegramConnection.findUnique({
      where: { id: connectionId },
    });
    if (!conn?.isActive) {
      return new Response("Inactive", { status: 400 });
    }

    const token = decrypt(conn.botToken);
    if (!token) {
      return new Response("No token", { status: 400 });
    }

    const update = (await req.json()) as TelegramBot.Update;
    await dispatchTelegramUpdate(connectionId, token, update);

    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response("Error", { status: 500 });
  }
}
