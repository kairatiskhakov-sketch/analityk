import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/config-status
 *
 * Возвращает, какие OAuth-интеграции настроены на уровне платформы (наличие
 * APP_ID / APP_SECRET в env). Секреты НЕ возвращаются — только булевы флаги,
 * чтобы UI мог показать понятное сообщение вместо сырого JSON-error при клике
 * по «Подключить аккаунт».
 */
export async function GET() {
  const meta = Boolean(
    process.env.META_APP_ID?.trim() && process.env.META_APP_SECRET?.trim(),
  );
  const tiktok = Boolean(
    process.env.TIKTOK_APP_ID?.trim() && process.env.TIKTOK_APP_SECRET?.trim(),
  );
  const google = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
  return NextResponse.json({ ok: true, meta, tiktok, google });
}
