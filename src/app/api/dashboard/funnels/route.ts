import { parseDashboardFilters } from "@/lib/dashboard/dashboard-query";
import { getDashboardFunnelsResolved } from "@/lib/dashboard/overview-stats";
import { jsonError, jsonOk } from "@/lib/http/json";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filters = parseDashboardFilters(searchParams);

    const { funnels, error } = await getDashboardFunnelsResolved(filters);
    if (error) {
      return jsonOk({ funnels: [], error: "CRM недоступна" });
    }
    return jsonOk({ funnels });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
