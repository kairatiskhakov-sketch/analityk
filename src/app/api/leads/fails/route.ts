import { leadIsLost } from "@/lib/bitrix/api";
import { fetchLeadsCached } from "@/lib/bitrix/cache";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { parseManagerIdsFromSearchParams } from "@/lib/dashboard/dashboard-query";
import { parseDashboardRangeFromSearchParams } from "@/lib/dashboard/range";
import { jsonError, jsonOk } from "@/lib/http/json";
import { topFailReasons } from "@/lib/dashboard/stats";

export const dynamic = "force-dynamic";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const connectionId = searchParams.get("connectionId");
    const { start, end } = parseDashboardRangeFromSearchParams(searchParams);
    const managerIds = parseManagerIdsFromSearchParams(searchParams);

    const conn = await getActiveBitrixConnection();
    const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
    if (!url) {
      return jsonOk({ fails: [] });
    }

    const df = ymd(start);
    const dt = ymd(end);
    const leads = await fetchLeadsCached(url, df, dt, managerIds);
    console.log(
      "Lead statuses in period:",
      Array.from(new Set(leads.map((l) => l.STATUS_ID))),
    );
    console.log("Total leads:", leads.length);
    console.log(
      "Lost leads:",
      leads.filter((l) => leadIsLost(l)).length,
    );
    console.log(
      "Sample lead STATUS_IDs:",
      Array.from(new Set(leads.map((l) => l.STATUS_ID))).slice(0, 10),
    );
    console.log(
      "Sample LOST_REASON_IDs:",
      leads.map((l) => l.LOST_REASON_ID).filter(Boolean).slice(0, 10),
    );

    const fails = await topFailReasons(start, end, connectionId, managerIds);
    return jsonOk({ fails });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
