import { parseDashboardFilters } from "@/lib/dashboard/dashboard-query";
import { getDashboardOverviewResolved } from "@/lib/dashboard/overview-stats";
import { jsonError, jsonOk } from "@/lib/http/json";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filters = parseDashboardFilters(searchParams);

    const { overview, hasCrm, error } =
      await getDashboardOverviewResolved(filters);
    if (error) {
      return jsonOk({
        overview: null,
        hasCrm,
        error: "CRM недоступна",
      });
    }
    if (!hasCrm) {
      return jsonOk({
        overview: null,
        hasCrm: false,
      });
    }
    return jsonOk({ overview, hasCrm: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
