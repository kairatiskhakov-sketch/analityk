import { jsonError } from "@/lib/http/json";
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
 */
export async function GET() {
  try {
    const orgId = await resolveOrgId();
    const nonce = randomBytes(12).toString("base64url");
    const state = `${orgId}:${nonce}`;
    const url = buildMetaAuthUrl(state);
    return NextResponse.redirect(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
