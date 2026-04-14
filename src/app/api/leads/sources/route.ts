import { fetchLeadsCached } from "@/lib/bitrix/cache";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { jsonError, jsonOk } from "@/lib/http/json";
import { parseManagerIdsFromSearchParams } from "@/lib/dashboard/dashboard-query";
import { parseDashboardRangeFromSearchParams } from "@/lib/dashboard/range";
import { leadsBySource } from "@/lib/dashboard/stats";

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
      return jsonOk({ sources: [] });
    }

    const df = ymd(start);
    const dt = ymd(end);
    const leads = await fetchLeadsCached(url, df, dt, managerIds);
    console.log(
      "Sample SOURCE_IDs:",
      Array.from(new Set(leads.map((l) => l.SOURCE_ID))).slice(0, 10),
    );

    const sources = await leadsBySource(start, end, connectionId, managerIds);
    return jsonOk({ sources });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
