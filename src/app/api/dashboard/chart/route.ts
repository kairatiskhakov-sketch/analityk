import {
  dealAnalyticsType,
  dealIsWon,
  getStageConfigs,
} from "@/lib/bitrix/api";
import { fetchDealsCached, fetchLeadsCached } from "@/lib/bitrix/cache";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { getOrSyncWonStageIds } from "@/lib/bitrix/won-stages";
import { parseDashboardFilters } from "@/lib/dashboard/dashboard-query";
import { ymdLocal } from "@/lib/plan/period";
import { jsonError, jsonOk } from "@/lib/http/json";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filters = parseDashboardFilters(searchParams);

    const active = await getActiveBitrixConnection();
    const webhookUrl = active ? getBitrixWebhookBaseUrl(active) : null;
    if (!webhookUrl) {
      return jsonOk({ series: [] });
    }

    const [wonStageIds, stageConfigs, leads, deals] = await Promise.all([
      getOrSyncWonStageIds(webhookUrl),
      getStageConfigs(),
      fetchLeadsCached(
        webhookUrl,
        ymdLocal(filters.start),
        ymdLocal(filters.end),
        filters.managerIds,
      ),
      fetchDealsCached(
        webhookUrl,
        ymdLocal(filters.start),
        ymdLocal(filters.end),
        filters.managerIds,
        filters.pipelineId,
      ),
    ]);

    const stageFilter = filters.stageIds ? new Set(filters.stageIds) : null;
    const scopedDeals = stageFilter
      ? deals.filter((d) => stageFilter.has(String(d.STAGE_ID ?? "")))
      : deals;

    const leadsByDay = new Map<string, number>();
    for (const lead of leads) {
      const day = String(lead.DATE_CREATE ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      leadsByDay.set(day, (leadsByDay.get(day) ?? 0) + 1);
    }

    const closedByDay = new Map<string, { count: number; sales: number }>();
    for (const deal of scopedDeals) {
      const isWon =
        stageConfigs.length > 0
          ? dealAnalyticsType(deal, stageConfigs, wonStageIds) === "won"
          : dealIsWon(deal, wonStageIds);
      if (!isWon) continue;
      const day = String(deal.DATE_CREATE ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const cur = closedByDay.get(day) ?? { count: 0, sales: 0 };
      cur.count += 1;
      cur.sales += Number(deal.OPPORTUNITY ?? 0);
      closedByDay.set(day, cur);
    }

    const series: { date: string; leads: number; closed: number; sales: number }[] = [];
    const cur = new Date(filters.start);
    const end = new Date(filters.end);
    cur.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    while (cur <= end) {
      const key = ymdLocal(cur);
      const closed = closedByDay.get(key) ?? { count: 0, sales: 0 };
      series.push({
        date: key,
        leads: leadsByDay.get(key) ?? 0,
        closed: closed.count,
        sales: closed.sales,
      });
      cur.setDate(cur.getDate() + 1);
    }

    return jsonOk({ series });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
