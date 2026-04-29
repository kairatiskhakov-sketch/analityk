import { buildTiktokAuthUrl } from "@/lib/integrations/tiktok/oauth";
import { resolveOrgId } from "@/lib/org/context";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/tiktok/auth
 * Редиректит в TikTok Business portal. В state кладём orgId, чтобы callback
 * мог привязать подключение к нужной организации без session.
 *
 * Если TIKTOK_APP_ID/SECRET не настроены — редиректим в settings с понятным
 * флагом, а не отдаём сырой JSON-error в браузер.
 */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  try {
    const orgId = await resolveOrgId();
    const nonce = randomBytes(12).toString("base64url");
    const state = `${orgId}:${nonce}`;
    const url = buildTiktokAuthUrl(state);
    return NextResponse.redirect(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    const isNotConfigured = /TIKTOK_APP_ID|TIKTOK_APP_SECRET/i.test(msg);
    if (isNotConfigured) {
      return NextResponse.redirect(
        new URL(
          "/dashboard/settings?tab=ads&ads_error=tiktok_not_configured",
          origin,
        ),
      );
    }
    return NextResponse.redirect(
      new URL(
        `/dashboard/settings?tab=ads&ads_error=tiktok_failed&tiktok_msg=${encodeURIComponent(msg)}`,
        origin,
      ),
    );
  }
}
