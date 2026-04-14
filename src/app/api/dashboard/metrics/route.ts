import {
  dealAnalyticsType,
  dealIsWon,
  getStageConfigs,
  leadIsLost,
  leadIsWon,
  parseOpportunity,
} from "@/lib/bitrix/api";
import { fetchDealsCached, fetchLeadsCached } from "@/lib/bitrix/cache";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { getOrSyncWonStageIds } from "@/lib/bitrix/won-stages";
import { parseManagerIdsFromSearchParams } from "@/lib/dashboard/dashboard-query";
import { EMPTY_LEAD_METRICS } from "@/lib/dashboard/no-crm-empty";
import { parseDashboardRangeFromSearchParams } from "@/lib/dashboard/range";
import { jsonError, jsonOk } from "@/lib/http/json";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const { start, end } = parseDashboardRangeFromSearchParams(searchParams);
    const managerIds = parseManagerIdsFromSearchParams(searchParams);

    const conn = await getActiveBitrixConnection();
    const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
    if (!url) {
      return jsonOk({
        period: { start, end },
        metrics: { ...EMPTY_LEAD_METRICS },
        avgDeal: 0,
        error: null,
      });
    }

    try {
      const df = ymd(start);
      const dt = ymd(end);
      const [wonStageIds, stageConfigs, leads, deals] = await Promise.all([
        getOrSyncWonStageIds(url),
        getStageConfigs(),
        fetchLeadsCached(url, df, dt, managerIds),
        fetchDealsCached(url, df, dt, managerIds),
      ]);

      const wonDeals = deals.filter((d) =>
        stageConfigs.length > 0
          ? dealAnalyticsType(d, stageConfigs, wonStageIds) === "won"
          : dealIsWon(d, wonStageIds),
      );
      const totalAmount = wonDeals.reduce(
        (s, d) => s + parseOpportunity(d.OPPORTUNITY),
        0,
      );
      console.log("Won stage IDs:", wonStageIds);
      console.log("Won deals count:", wonDeals.length);
      console.log("Total amount:", totalAmount);

      const totalLeads = leads.length;
      const wonLeadsCount = leads.filter(leadIsWon).length;
      const lostLeadsCount = leads.filter(leadIsLost).length;
      const avgDeal =
        wonLeadsCount > 0 ? totalAmount / wonLeadsCount : 0;

      return jsonOk({
        period: { start, end },
        metrics: {
          total: totalLeads,
          won: wonLeadsCount,
          lost: lostLeadsCount,
          inProgress: leads.filter(
            (l) => !leadIsWon(l) && !leadIsLost(l),
          ).length,
          salesAmount: totalAmount,
        },
        avgDeal,
        error: null,
      });
    } catch {
      return jsonOk({
        period: { start, end },
        metrics: null,
        avgDeal: null,
        error: "CRM недоступна",
        data: null,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
