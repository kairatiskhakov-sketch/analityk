import { encrypt } from "@/lib/crypto";
import { exchangeGoogleAuthCode, fetchGoogleUserEmail } from "@/lib/integrations/google/oauth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const err = searchParams.get("error");

    if (err) {
      return NextResponse.redirect(
        new URL(`/?google_error=${encodeURIComponent(err)}`, origin),
      );
    }
    if (!code || !state) {
      return NextResponse.redirect(
        new URL("/?google_error=missing_code", origin),
      );
    }

    const tokens = await exchangeGoogleAuthCode(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(
        new URL("/?google_error=no_tokens", origin),
      );
    }

    const email = await fetchGoogleUserEmail(tokens.access_token);
    const expiryMs = tokens.expiry_date ?? Date.now() + 3600 * 1000;

    await prisma.googleConnection.update({
      where: { id: state },
      data: {
        email,
        accessToken: encrypt(tokens.access_token),
        refreshToken: encrypt(tokens.refresh_token),
        tokenExpiresAt: new Date(expiryMs),
      },
    });

    return NextResponse.redirect(new URL("/?google_connected=1", origin));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth ошибка";
    return NextResponse.redirect(
      new URL(`/?google_error=${encodeURIComponent(msg)}`, origin),
    );
  }
}
