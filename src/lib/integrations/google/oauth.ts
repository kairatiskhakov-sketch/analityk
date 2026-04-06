import { google } from "googleapis";

/** Единые scope для Ads + Sheets + GA4 + email */
export const GOOGLE_INTEGRATION_SCOPES = [
  "https://www.googleapis.com/auth/adwords",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
] as const;

export function createGoogleOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Задайте GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI",
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function buildGoogleAuthUrl(state: string): string {
  const oauth2 = createGoogleOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    scope: [...GOOGLE_INTEGRATION_SCOPES],
    state,
    prompt: "consent",
    include_granted_scopes: true,
  });
}

export async function exchangeGoogleAuthCode(code: string) {
  const oauth2 = createGoogleOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const oauth2 = createGoogleOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2.refreshAccessToken();
  return credentials;
}

export async function fetchGoogleUserEmail(accessToken: string): Promise<string> {
  const oauth2 = createGoogleOAuth2Client();
  oauth2.setCredentials({ access_token: accessToken });
  const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
  const { data } = await oauth2Api.userinfo.get();
  return data.email ?? "unknown@google.com";
}
