import { normalizeBitrixDomain } from "./client";

export type ParsedBitrixWebhook = {
  event: string;
  entityId?: string;
  raw: unknown;
};

/**
 * Разбор тела вебхука Bitrix24 (JSON).
 * События могут называться ONCRMLEADADD, ONCRMLCREATE (алиас) и т.д.
 */
export function parseBitrixWebhookBody(body: unknown): ParsedBitrixWebhook {
  if (!body || typeof body !== "object") {
    throw new Error("Bitrix webhook: пустое тело");
  }
  const b = body as Record<string, unknown>;
  const event = String(b.event ?? b.EVENT ?? "");
  const data = (b.data ?? b.DATA) as Record<string, unknown> | undefined;

  let entityId: string | undefined;
  if (data?.FIELDS && typeof data.FIELDS === "object") {
    const id = (data.FIELDS as Record<string, unknown>).ID;
    if (id != null) entityId = String(id);
  }
  if (!entityId && data && typeof data.ID !== "undefined") {
    entityId = String(data.ID);
  }

  return { event, entityId, raw: body };
}

/**
 * Нормализует hostname (без порта) и сравнивает с сохранённым доменом Bitrix24.
 */
export function verifyBitrixWebhookDomain(
  requestHost: string,
  savedDomain: string,
): boolean {
  const host = requestHost.trim().toLowerCase().split(":")[0] ?? "";
  const expected = normalizeBitrixDomain(savedDomain).toLowerCase();
  return host === expected;
}

/** Домен портала из `auth.domain` в теле вебхука Bitrix24 */
export function extractBitrixAuthDomain(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  const auth = b.auth as Record<string, unknown> | undefined;
  const d = auth?.domain ?? b.domain;
  return typeof d === "string" ? d : undefined;
}

/** Сверка домена из тела вебхука с сохранённым `bitrixDomain`. */
export function verifyBitrixWebhookPortalDomain(
  bodyDomain: string | undefined,
  savedDomain: string,
): boolean {
  if (!bodyDomain?.trim()) return false;
  return (
    normalizeBitrixDomain(bodyDomain) === normalizeBitrixDomain(savedDomain)
  );
}
