import axios from "axios";
import type { AmoTokenResponse } from "./types";
import { normalizeAmoSubdomain } from "./client";

/**
 * URL авторизации OAuth 2.0 (authorization code).
 */
export function buildAmoAuthorizationUrl(
  subdomain: string,
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const s = normalizeAmoSubdomain(subdomain);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    state,
    redirect_uri: redirectUri,
  });
  return `https://${s}.amocrm.ru/oauth?${params.toString()}`;
}

/**
 * Обмен code на токены.
 */
export async function exchangeAmoAuthorizationCode(
  subdomain: string,
  params: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
  },
): Promise<AmoTokenResponse> {
  const s = normalizeAmoSubdomain(subdomain);
  const url = `https://${s}.amocrm.ru/oauth2/access_token`;
  const { data } = await axios.post<AmoTokenResponse>(
    url,
    {
      client_id: params.clientId,
      client_secret: params.clientSecret,
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
    },
    { headers: { "Content-Type": "application/json" }, timeout: 60_000 },
  );
  return data;
}

/**
 * Обновление access_token по refresh_token (для cron ~24ч).
 */
export async function refreshAmoAccessToken(
  subdomain: string,
  params: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    redirectUri: string;
  },
): Promise<AmoTokenResponse> {
  const s = normalizeAmoSubdomain(subdomain);
  const url = `https://${s}.amocrm.ru/oauth2/access_token`;
  const { data } = await axios.post<AmoTokenResponse>(
    url,
    {
      client_id: params.clientId,
      client_secret: params.clientSecret,
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
      redirect_uri: params.redirectUri,
    },
    { headers: { "Content-Type": "application/json" }, timeout: 60_000 },
  );
  return data;
}

/** Время истечения access_token */
export function amoTokenExpiresAt(token: AmoTokenResponse, nowMs = Date.now()): Date {
  const sec = typeof token.expires_in === "number" ? token.expires_in : 3600;
  return new Date(nowMs + sec * 1000);
}
