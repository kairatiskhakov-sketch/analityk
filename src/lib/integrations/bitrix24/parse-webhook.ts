import { normalizeBitrixDomain } from "./client";

/**
 * Разбор входящего вебхука Bitrix24:
 * https://portal.bitrix24.ru/rest/1/xxxxxxxxxxxxxxxx/
 */
export function parseBitrixWebhookUrl(webhookUrl: string): {
  domain: string;
  userId: string;
  webhookToken: string;
} {
  const u = webhookUrl.trim();
  const m = u.match(/^https?:\/\/([^/]+)\/rest\/(\d+)\/([^/?#]+)\/?$/i);
  if (!m) {
    throw new Error(
      "Неверный формат URL. Ожидается: https://домен/rest/ID/токен/",
    );
  }
  return {
    domain: m[1].toLowerCase(),
    userId: m[2],
    webhookToken: m[3],
  };
}

export function domainsMatch(domainField: string, domainFromUrl: string): boolean {
  return (
    normalizeBitrixDomain(domainField) === normalizeBitrixDomain(domainFromUrl)
  );
}
