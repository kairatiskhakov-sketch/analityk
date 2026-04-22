import { decrypt } from "@/lib/crypto";
import { dispatchTelegramUpdate } from "@/lib/integrations/telegram/commands";
import { verifyTelegramWebhookSecret } from "@/lib/integrations/telegram/bot";
import { prisma } from "@/lib/prisma";
import { createLogger, errorFields, shortId } from "@/lib/log/logger";
import type TelegramBot from "node-telegram-bot-api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const reqId = shortId();
  const log = createLogger("webhook.telegram", { reqId });
  const t0 = Date.now();

  try {
    if (!verifyTelegramWebhookSecret(req)) {
      log.warn("bad secret", { durMs: Date.now() - t0 });
      return new Response("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const connectionId = searchParams.get("connectionId");

    if (!connectionId) {
      log.warn("missing connectionId", { durMs: Date.now() - t0 });
      return new Response("Missing connectionId", { status: 400 });
    }

    const conn = await prisma.telegramConnection.findUnique({
      where: { id: connectionId },
    });
    if (!conn?.isActive) {
      log.warn("inactive connection", { connectionId, durMs: Date.now() - t0 });
      return new Response("Inactive", { status: 400 });
    }

    const token = decrypt(conn.botToken);
    if (!token) {
      log.warn("no token", { connectionId, durMs: Date.now() - t0 });
      return new Response("No token", { status: 400 });
    }

    const update = (await req.json()) as TelegramBot.Update;
    log.info("received", {
      connectionId,
      orgId: conn.orgId,
      updateId: update.update_id,
      kind:
        update.message
          ? "message"
          : update.callback_query
            ? "callback"
            : "other",
    });

    await dispatchTelegramUpdate(connectionId, token, update);

    log.info("done", { connectionId, durMs: Date.now() - t0 });
    return new Response("OK", { status: 200 });
  } catch (e) {
    log.error("unhandled", { durMs: Date.now() - t0, ...errorFields(e) });
    return new Response("Error", { status: 500 });
  }
}
