import { jsonError } from "@/lib/http/json";
import { buildTiktokAuthUrl } from "@/lib/integrations/tiktok/oauth";
import { resolveOrgId } from "@/lib/org/context";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/tiktok/auth
 * Редиректит в TikTok Business portal. В state кладём orgId, чтобы callback
 * мог привязать подключение к нужной организации без session.
 */
export async function GET() {
  try {
    const orgId = await resolveOrgId();
    const nonce = randomBytes(12).toString("base64url");
    const state = `${orgId}:${nonce}`;
    const url = buildTiktokAuthUrl(state);
    return NextResponse.redirect(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
