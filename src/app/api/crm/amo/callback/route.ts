import { decrypt, encrypt } from "@/lib/crypto";
import {
  amoTokenExpiresAt,
  exchangeAmoAuthorizationCode,
} from "@/lib/integrations/amocrm/oauth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const err = searchParams.get("error");

    const origin = new URL(req.url).origin;

    if (err) {
      return NextResponse.redirect(
        new URL(`/?amo_error=${encodeURIComponent(err)}`, origin),
      );
    }
    if (!code || !state) {
      return NextResponse.redirect(
        new URL("/?amo_error=missing_code_or_state", origin),
      );
    }

    const conn = await prisma.crmConnection.findUnique({
      where: { id: state },
    });
    if (!conn || conn.crmType !== "amocrm" || !conn.amoSubdomain || !conn.amoClientSecret) {
      return NextResponse.redirect(
        new URL("/?amo_error=connection_not_found", origin),
      );
    }

    const clientId = conn.amoClientId ?? process.env.AMOCRM_CLIENT_ID;
    if (!clientId) {
      return NextResponse.redirect(
        new URL("/?amo_error=missing_client_id", origin),
      );
    }

    const redirectUri =
      process.env.AMOCRM_REDIRECT_URI ??
      `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/crm/amo/callback`;

    const tokens = await exchangeAmoAuthorizationCode(conn.amoSubdomain, {
      clientId,
      clientSecret: decrypt(conn.amoClientSecret),
      code,
      redirectUri,
    });

    const expiresAt = amoTokenExpiresAt(tokens);

    await prisma.crmConnection.update({
      where: { id: conn.id },
      data: {
        isActive: true,
        amoAccessToken: encrypt(tokens.access_token),
        amoRefreshToken: encrypt(tokens.refresh_token),
        amoTokenExpiresAt: expiresAt,
      },
    });

    return NextResponse.redirect(new URL("/?amo_connected=1", origin));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth ошибка";
    const origin = new URL(req.url).origin;
    return NextResponse.redirect(
      new URL(`/?amo_error=${encodeURIComponent(msg)}`, origin),
    );
  }
}
