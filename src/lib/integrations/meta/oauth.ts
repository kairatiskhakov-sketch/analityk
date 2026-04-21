/**
 * Meta (Facebook) Ads OAuth helpers.
 * Docs: https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow
 *        https://developers.facebook.com/docs/marketing-api/overview
 */

export const META_GRAPH_VERSION = "v19.0";
export const META_OAUTH_SCOPES = ["ads_read", "business_management"] as const;

type MetaConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

function readConfig(): MetaConfig {
  const clientId = process.env.META_APP_ID?.trim();
  const clientSecret = process.env.META_APP_SECRET?.trim();
  const redirectUri =
    process.env.META_REDIRECT_URI?.trim() ||
    `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/integrations/meta/callback`;
  if (!clientId || !clientSecret) {
    throw new Error("Задайте META_APP_ID и META_APP_SECRET в env");
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildMetaAuthUrl(state: string): string {
  const { clientId, redirectUri } = readConfig();
  const url = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", META_OAUTH_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  return url.toString();
}

export type MetaTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

async function postGraphForm(path: string, params: Record<string, string>): Promise<MetaTokenResponse> {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  const data = (await res.json()) as unknown;
  if (!res.ok) {
    const msg =
      (data as { error?: { message?: string } } | null)?.error?.message ??
      `HTTP ${res.status}`;
    throw new Error(`Meta OAuth: ${msg}`);
  }
  return data as MetaTokenResponse;
}

/** Обмен authorization code на короткоживущий токен (≈1-2 часа). */
export async function exchangeMetaAuthCode(code: string): Promise<MetaTokenResponse> {
  const { clientId, clientSecret, redirectUri } = readConfig();
  return postGraphForm("oauth/access_token", {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });
}

/** Обменивает short-lived user token на long-lived (≈60 дней). */
export async function exchangeForLongLivedToken(shortToken: string): Promise<MetaTokenResponse> {
  const { clientId, clientSecret } = readConfig();
  return postGraphForm("oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: clientId,
    client_secret: clientSecret,
    fb_exchange_token: shortToken,
  });
}

export function metaTokenExpiresAt(resp: MetaTokenResponse): Date | null {
  if (!resp.expires_in) return null;
  return new Date(Date.now() + resp.expires_in * 1000);
}
