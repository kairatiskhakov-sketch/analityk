import TelegramBot from "node-telegram-bot-api";

export function createTelegramBot(token: string): TelegramBot {
  return new TelegramBot(token, { polling: false });
}

/**
 * Проверка заголовка из setWebhook(secret_token).
 * Если TELEGRAM_WEBHOOK_SECRET не задан — пропуск (только для dev).
 */
export function verifyTelegramWebhookSecret(req: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected) return true;
  return req.headers.get("x-telegram-bot-api-secret-token") === expected;
}

/**
 * Регистрация вебхука (вызывать при старте / из cron register).
 */
export async function setTelegramWebhook(
  token: string,
  webhookUrl: string,
  secretToken?: string,
): Promise<void> {
  const params = new URLSearchParams();
  params.set("url", webhookUrl);
  if (secretToken) params.set("secret_token", secretToken);
  const res = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook?${params.toString()}`,
  );
  const data = (await res.json()) as { ok?: boolean; description?: string };
  if (!data.ok) {
    throw new Error(data.description ?? "setWebhook failed");
  }
}
