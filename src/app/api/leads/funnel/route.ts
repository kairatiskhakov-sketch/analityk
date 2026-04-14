import { getFirstActiveCrmConnection } from "@/lib/crm/active-connection";
import { EMPTY_FUNNEL } from "@/lib/dashboard/no-crm-empty";
import { jsonError, jsonOk } from "@/lib/http/json";
import { parseDashboardRangeFromSearchParams } from "@/lib/dashboard/range";
import { getPipelineFunnel } from "@/lib/dashboard/stats";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const connectionId = searchParams.get("connectionId");
    const { start, end } = parseDashboardRangeFromSearchParams(searchParams);

    const active = await getFirstActiveCrmConnection();
    if (!active) {
      return jsonOk({
        funnel: {
          stages: [...EMPTY_FUNNEL.stages],
          summary: { ...EMPTY_FUNNEL.summary },
        },
      });
    }

    const funnel = await getPipelineFunnel(start, end, connectionId);
    return jsonOk({ funnel });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
