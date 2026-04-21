import { encrypt } from "@/lib/crypto";
import { fetchTiktokAdvertisers } from "@/lib/integrations/tiktok/client";
import {
  exchangeTiktokAuthCode,
  tiktokTokenExpiresAt,
} from "@/lib/integrations/tiktok/oauth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  try {
    const { searchParams } = new URL(req.url);
    // TikTok возвращает auth_code (а не code) и state.
    const authCode = searchParams.get("auth_code") ?? searchParams.get("code");
    const state = searchParams.get("state");
    const err = searchParams.get("error") ?? searchParams.get("error_description");
    if (err) {
      return NextResponse.redirect(
        new URL(`/?tiktok_error=${encodeURIComponent(err)}`, origin),
      );
    }
    if (!authCode || !state) {
      return NextResponse.redirect(
        new URL("/?tiktok_error=missing_code_or_state", origin),
      );
    }
    const orgId = state.split(":")[0];
    if (!orgId) {
      return NextResponse.redirect(new URL("/?tiktok_error=bad_state", origin));
    }

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      return NextResponse.redirect(new URL("/?tiktok_error=unknown_org", origin));
    }

    const tok = await exchangeTiktokAuthCode(authCode);
    const advertiserIds = tok.advertiser_ids ?? [];
    if (!advertiserIds.length) {
      return NextResponse.redirect(
        new URL("/?tiktok_error=no_advertisers", origin),
      );
    }
    const expiresAt = tiktokTokenExpiresAt(tok);
    const encAccess = encrypt(tok.access_token);
    const encRefresh = tok.refresh_token ? encrypt(tok.refresh_token) : null;

    const advertisers = await fetchTiktokAdvertisers(advertiserIds, tok.access_token)
      .catch(() => [] as Awaited<ReturnType<typeof fetchTiktokAdvertisers>>);
    const nameById = new Map(advertisers.map((a) => [a.advertiser_id, a.name ?? null] as const));

    for (const advId of advertiserIds) {
      await prisma.adConnection.upsert({
        where: {
          orgId_platform_accountId: {
            orgId,
            platform: "TIKTOK",
            accountId: advId,
          },
        },
        create: {
          orgId,
          platform: "TIKTOK",
          accountId: advId,
          accountName: nameById.get(advId) ?? null,
          accessToken: encAccess,
          refreshToken: encRefresh,
          tokenExpiresAt: expiresAt,
          status: "ACTIVE",
        },
        update: {
          accountName: nameById.get(advId) ?? null,
          accessToken: encAccess,
          refreshToken: encRefresh,
          tokenExpiresAt: expiresAt,
          status: "ACTIVE",
          lastError: null,
        },
      });
    }

    return NextResponse.redirect(
      new URL(`/?tiktok_connected=${advertiserIds.length}`, origin),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth ошибка";
    return NextResponse.redirect(
      new URL(`/?tiktok_error=${encodeURIComponent(msg)}`, origin),
    );
  }
}
