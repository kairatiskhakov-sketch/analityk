import { jsonError, jsonOk } from "@/lib/http/json";
import {
  syncAllGoogleAds,
  syncAllMetaAds,
  syncAllTiktokAds,
} from "@/lib/integrations/shared/scheduler";

export const dynamic = "force-dynamic";
// Ads APIs бывают медленные — даём запас времени.
export const maxDuration = 300;

/**
 * GET /api/cron/ads
 *
 * Ежедневный синк рекламных площадок (Google Ads / Meta / TikTok).
 * Дёргается Vercel Cron (см. vercel.json). Vercel автоматически добавляет
 * заголовок `Authorization: Bearer ${CRON_SECRET}` если env задан.
 *
 * Все три синка запускаются параллельно через allSettled —
 * ошибка одной платформы не валит остальные.
 */
function verifyCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // Без секрета считаем cron недоступным, чтобы случайно не открыть эндпоинт публично.
    return false;
  }
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!verifyCron(req)) {
    return jsonError("Unauthorized", 401);
  }

  const started = Date.now();
  const [google, meta, tiktok] = await Promise.allSettled([
    syncAllGoogleAds(),
    syncAllMetaAds(),
    syncAllTiktokAds(),
  ]);

  const toEntry = (
    name: string,
    r: PromiseSettledResult<{ job: string; ok: boolean; detail?: string }>,
  ) =>
    r.status === "fulfilled"
      ? { platform: name, ok: r.value.ok, detail: r.value.detail ?? null }
      : {
          platform: name,
          ok: false,
          detail: r.reason instanceof Error ? r.reason.message : String(r.reason),
        };

  const results = [
    toEntry("google", google),
    toEntry("meta", meta),
    toEntry("tiktok", tiktok),
  ];
  const allOk = results.every((r) => r.ok);

  return jsonOk({
    ok: allOk,
    durationMs: Date.now() - started,
    results,
  });
}
