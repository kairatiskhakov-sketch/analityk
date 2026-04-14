import { getFirstActiveCrmConnection } from "@/lib/crm/active-connection";
import { parseManagerIdsFromSearchParams } from "@/lib/dashboard/dashboard-query";
import { EMPTY_FUNNEL, EMPTY_LEAD_METRICS } from "@/lib/dashboard/no-crm-empty";
import { jsonError, jsonOk } from "@/lib/http/json";
import { parseDashboardRangeFromSearchParams } from "@/lib/dashboard/range";
import { getLeadMetrics, getPipelineFunnel } from "@/lib/dashboard/stats";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const managerIds = parseManagerIdsFromSearchParams(searchParams);
    const { start, end } = parseDashboardRangeFromSearchParams(searchParams);

    const active = await getFirstActiveCrmConnection();
    if (!active) {
      return jsonOk({
        metrics: { ...EMPTY_LEAD_METRICS },
        funnel: {
          stages: [...EMPTY_FUNNEL.stages],
          summary: { ...EMPTY_FUNNEL.summary },
        },
      });
    }

    const [metrics, funnel] = await Promise.all([
      getLeadMetrics(start, end, null, managerIds),
      getPipelineFunnel(start, end, null, managerIds),
    ]);
    return jsonOk({ metrics, funnel });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
