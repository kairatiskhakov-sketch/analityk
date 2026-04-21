/**
 * TikTok Business / Marketing API — OAuth helpers.
 * Docs: https://business-api.tiktok.com/portal/docs?id=1738373164380162
 *
 * Flow:
 *   1) redirect → https://business-api.tiktok.com/portal/auth?app_id&state&redirect_uri
 *   2) callback получает ?auth_code
 *   3) POST /open_api/v1.3/oauth2/access_token/  { app_id, secret, auth_code }
 *      → { data: { access_token, refresh_token?, advertiser_ids: string[] } }
 */

export const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";
export const TIKTOK_PORTAL_BASE = "https://business-api.tiktok.com/portal";

type TiktokConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
};

function readConfig(): TiktokConfig {
  const appId = process.env.TIKTOK_APP_ID?.trim();
  const appSecret = process.env.TIKTOK_APP_SECRET?.trim();
  const redirectUri =
    process.env.TIKTOK_REDIRECT_URI?.trim() ||
    `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/integrations/tiktok/callback`;
  if (!appId || !appSecret) {
    throw new Error("Задайте TIKTOK_APP_ID и TIKTOK_APP_SECRET в env");
  }
  return { appId, appSecret, redirectUri };
}

export function buildTiktokAuthUrl(state: string): string {
  const { appId, redirectUri } = readConfig();
  const url = new URL(`${TIKTOK_PORTAL_BASE}/auth`);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);
  return url.toString();
}

export type TiktokTokenResponse = {
  access_token: string;
  refresh_token?: string;
  /** TikTok иногда возвращает expires_in в секундах, часто — нет (long-lived). */
  expires_in?: number;
  refresh_token_expires_in?: number;
  advertiser_ids?: string[];
  scope?: string[];
};

type TiktokEnvelope<T> = {
  code: number;
  message: string;
  request_id?: string;
  data: T;
};

export async function exchangeTiktokAuthCode(
  authCode: string,
): Promise<TiktokTokenResponse> {
  const { appId, appSecret } = readConfig();
  const res = await fetch(`${TIKTOK_API_BASE}/oauth2/access_token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      app_id: appId,
      secret: appSecret,
      auth_code: authCode,
    }),
  });
  const env = (await res.json()) as TiktokEnvelope<TiktokTokenResponse> | null;
  if (!res.ok || !env || env.code !== 0) {
    const msg = env?.message ?? `HTTP ${res.status}`;
    throw new Error(`TikTok OAuth: ${msg}`);
  }
  return env.data;
}

export function tiktokTokenExpiresAt(resp: TiktokTokenResponse): Date | null {
  if (!resp.expires_in) return null;
  return new Date(Date.now() + resp.expires_in * 1000);
}
