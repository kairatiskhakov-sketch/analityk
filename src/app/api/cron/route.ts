import { jsonError, jsonOk } from "@/lib/http/json";
import {
  exportToSheetsNightly,
  refreshAllAmoTokens,
  registerTelegramWebhooks,
  runAllScheduledJobs,
  sendDailyTelegramReports,
  syncAllCrm,
  syncAllMetaAds,
  syncAllTiktokAds,
} from "@/lib/integrations/shared/scheduler";

export const dynamic = "force-dynamic";

function verifyCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/**
 * POST /api/cron
 * Authorization: Bearer CRON_SECRET
 * body: { "job": "sync" | "amo" | "meta" | "tiktok" | "sheets" | "telegram-daily" | "telegram-webhook" | "all" }
 */
export async function POST(req: Request) {
  if (!verifyCron(req)) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { job?: string };
    const job = body.job ?? "all";

    switch (job) {
      case "sync":
        return jsonOk({ result: await syncAllCrm() });
      case "amo":
        return jsonOk({ result: await refreshAllAmoTokens() });
      case "meta":
        return jsonOk({ result: await syncAllMetaAds() });
      case "tiktok":
        return jsonOk({ result: await syncAllTiktokAds() });
      case "sheets":
        return jsonOk({ result: await exportToSheetsNightly() });
      case "telegram-daily":
        return jsonOk({ result: await sendDailyTelegramReports(false) });
      case "telegram-daily-scheduled":
        return jsonOk({ result: await sendDailyTelegramReports(true) });
      case "telegram-webhook":
        return jsonOk({ result: await registerTelegramWebhooks() });
      case "all":
        return jsonOk({ results: await runAllScheduledJobs() });
      default:
        return jsonError("Unknown job", 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Cron error";
    return jsonError(msg, 500);
  }
}
