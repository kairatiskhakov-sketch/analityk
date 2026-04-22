import crypto from "node:crypto";

/** Длительность действия инвайта по умолчанию — 14 дней. */
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** Генерирует URL-safe токен инвайта длиной 32 байта (~43 символа base64url). */
export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Абсолютный URL приглашения для вставки в UI / письма. */
export function buildInviteUrl(token: string, origin?: string): string {
  const base =
    origin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "";
  const cleaned = base.replace(/\/+$/, "");
  return `${cleaned}/join/${token}`;
}

/** Нормализует email — trim + lowercase. */
export function normalizeEmail(raw: string | undefined | null): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  if (!e) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}
