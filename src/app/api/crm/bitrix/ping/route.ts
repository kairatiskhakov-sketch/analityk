import { jsonError, jsonOk } from "@/lib/http/json";
import { createBitrix24Client } from "@/lib/integrations/bitrix24/client";
import { parseBitrixWebhookUrl } from "@/lib/integrations/bitrix24/parse-webhook";

export const dynamic = "force-dynamic";

type Body = { webhookUrl?: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const raw = body.webhookUrl?.trim();
    if (!raw) {
      return jsonError("Укажите URL вебхука", 400);
    }
    if (!raw.startsWith("https://")) {
      return jsonError("Некорректный URL вебхука", 400);
    }

    const parsed = parseBitrixWebhookUrl(raw);
    const client = createBitrix24Client({
      domain: parsed.domain,
      userId: parsed.userId,
      webhookToken: parsed.webhookToken,
    });

    await client.call("profile", {});

    return jsonOk({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка проверки";
    return jsonError(msg, 400);
  }
}
