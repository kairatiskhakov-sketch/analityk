import { jsonError, jsonOk } from "@/lib/http/json";
import { parseDashboardPeriod } from "@/lib/dashboard/range";
import { leadsBySource } from "@/lib/dashboard/stats";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period");
    const connectionId = searchParams.get("connectionId");
    const { start, end } = parseDashboardPeriod(period);
    const sources = await leadsBySource(start, end, connectionId);
    return jsonOk({ sources });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
