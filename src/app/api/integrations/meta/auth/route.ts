import { buildMetaAuthUrl } from "@/lib/integrations/meta/oauth";
import { resolveOrgId } from "@/lib/org/context";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/meta/auth
 * Редиректит пользователя на Facebook OAuth. В state кодируем orgId, чтобы
 * callback мог привязать подключение к правильной организации без session
 * (браузер уходит на facebook.com и возвращается с другим referer).
 *
 * Если META_APP_ID/SECRET не настроены — редиректим в settings с понятным
 * флагом, а не отдаём сырой JSON-error в браузер.
 */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  try {
    const orgId = await resolveOrgId();
    const nonce = randomBytes(12).toString("base64url");
    const state = `${orgId}:${nonce}`;
    const url = buildMetaAuthUrl(state);
    return NextResponse.redirect(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    const isNotConfigured = /META_APP_ID|META_APP_SECRET/i.test(msg);
    if (isNotConfigured) {
      return NextResponse.redirect(
        new URL("/dashboard/settings?tab=ads&ads_error=meta_not_configured", origin),
      );
    }
    return NextResponse.redirect(
      new URL(
        `/dashboard/settings?tab=ads&ads_error=meta_failed&meta_msg=${encodeURIComponent(msg)}`,
        origin,
      ),
    );
  }
}
