import { getFirstActiveCrmConnection } from "@/lib/crm/active-connection";
import { parseManagerIdsFromSearchParams } from "@/lib/dashboard/dashboard-query";
import { jsonError, jsonOk } from "@/lib/http/json";
import { parseDashboardRangeFromSearchParams } from "@/lib/dashboard/range";
import { leadsByDay } from "@/lib/dashboard/stats";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const managerIds = parseManagerIdsFromSearchParams(searchParams);
    const { start, end } = parseDashboardRangeFromSearchParams(searchParams);

    const active = await getFirstActiveCrmConnection();
    if (!active) {
      return jsonOk({ series: [] });
    }

    const series = await leadsByDay(start, end, null, managerIds);
    return jsonOk({ series });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
