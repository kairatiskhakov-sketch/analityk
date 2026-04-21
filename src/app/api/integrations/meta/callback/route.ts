import { encrypt } from "@/lib/crypto";
import { fetchMetaAdAccounts } from "@/lib/integrations/meta/client";
import {
  exchangeForLongLivedToken,
  exchangeMetaAuthCode,
  metaTokenExpiresAt,
} from "@/lib/integrations/meta/oauth";
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
        new URL(`/?meta_error=${encodeURIComponent(err)}`, origin),
      );
    }
    if (!code || !state) {
      return NextResponse.redirect(
        new URL("/?meta_error=missing_code_or_state", origin),
      );
    }
    const orgId = state.split(":")[0];
    if (!orgId) {
      return NextResponse.redirect(new URL("/?meta_error=bad_state", origin));
    }

    // убеждаемся, что org существует (state мог быть подделан)
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      return NextResponse.redirect(new URL("/?meta_error=unknown_org", origin));
    }

    const short = await exchangeMetaAuthCode(code);
    const long = await exchangeForLongLivedToken(short.access_token);
    const expiresAt = metaTokenExpiresAt(long);

    const accounts = await fetchMetaAdAccounts(long.access_token);
    if (!accounts.length) {
      return NextResponse.redirect(
        new URL("/?meta_error=no_ad_accounts", origin),
      );
    }

    const encToken = encrypt(long.access_token);

    // Апсёрт по (orgId, platform, accountId) — на случай переподключения того же кабинета.
    for (const a of accounts) {
      await prisma.adConnection.upsert({
        where: {
          orgId_platform_accountId: {
            orgId,
            platform: "META",
            accountId: a.id,
          },
        },
        create: {
          orgId,
          platform: "META",
          accountId: a.id,
          accountName: a.name ?? null,
          accessToken: encToken,
          tokenExpiresAt: expiresAt,
          extra: a.business?.id ? JSON.stringify({ businessId: a.business.id }) : null,
          status: "ACTIVE",
        },
        update: {
          accountName: a.name ?? null,
          accessToken: encToken,
          tokenExpiresAt: expiresAt,
          extra: a.business?.id ? JSON.stringify({ businessId: a.business.id }) : null,
          status: "ACTIVE",
          lastError: null,
        },
      });
    }

    return NextResponse.redirect(
      new URL(`/?meta_connected=${accounts.length}`, origin),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth ошибка";
    return NextResponse.redirect(
      new URL(`/?meta_error=${encodeURIComponent(msg)}`, origin),
    );
  }
}
