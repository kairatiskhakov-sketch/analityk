import { parseOpportunity } from "@/lib/bitrix/api";
import { fetchManagersCached } from "@/lib/bitrix/cache";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { fetchNewSalesForPeriod } from "@/lib/bitrix/stage-history-sales";
import { parseManagerIdsFromSearchParams } from "@/lib/dashboard/dashboard-query";
import { parseDashboardRangeFromSearchParams } from "@/lib/dashboard/range";
import { jsonError, jsonOk } from "@/lib/http/json";

export const dynamic = "force-dynamic";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const { start, end } = parseDashboardRangeFromSearchParams(searchParams);
    const managerIds = parseManagerIdsFromSearchParams(searchParams);
    const pipelineId = searchParams.get("pipelineId") || undefined;
    const stageIdsRaw = searchParams.get("stageIds");
    const stageSet = stageIdsRaw
      ? new Set(stageIdsRaw.split(",").map((s) => s.trim()).filter(Boolean))
      : null;

    const conn = await getActiveBitrixConnection();
    const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
    if (!url) {
      return jsonOk({ ranking: [] });
    }

    const [sales, managers] = await Promise.all([
      fetchNewSalesForPeriod(url, ymd(start), ymd(end)),
      fetchManagersCached(url),
    ]);
    const won = stageSet
      ? sales.wonDeals.filter((d) => stageSet.has(String(d.STAGE_ID ?? "")))
      : sales.wonDeals;
    const nameById = new Map(managers.map((m) => [m.id, m.name]));

    const map = new Map<
      string,
      { name: string; deals: number; amount: number }
    >();
    for (const d of won) {
      const id = (d.ASSIGNED_BY_ID ?? "").toString();
      if (!id) continue;
      const name = nameById.get(id) ?? id;
      const cur = map.get(id) ?? { name, deals: 0, amount: 0 };
      cur.deals += 1;
      cur.amount += parseOpportunity(d.OPPORTUNITY);
      map.set(id, cur);
    }

    const ranking = Array.from(map.values()).sort((a, b) => b.amount - a.amount);

    return jsonOk({ ranking });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
