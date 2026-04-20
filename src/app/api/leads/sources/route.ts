import {
  fetchDealsCached,
  fetchSourcesCatalogCached,
} from "@/lib/bitrix/cache";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { jsonError, jsonOk } from "@/lib/http/json";
import { parseDashboardFilters } from "@/lib/dashboard/dashboard-query";
import {
  dealAnalyticsType,
  dealIsLost,
  dealIsWon,
  getStageConfigs,
} from "@/lib/bitrix/api";
import { getOrSyncWonStageIds } from "@/lib/bitrix/won-stages";
import { resolveBitrixSourceLabel } from "@/lib/bitrix/bitrix-labels";

export const dynamic = "force-dynamic";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filters = parseDashboardFilters(searchParams);

    const conn = await getActiveBitrixConnection();
    const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
    if (!url) {
      return jsonOk({ sources: [] });
    }

    const [wonStageIds, deals, sourceCat, stageConfigs] = await Promise.all([
      getOrSyncWonStageIds(url),
      fetchDealsCached(
        url,
        ymd(filters.start),
        ymd(filters.end),
        filters.managerIds,
        filters.pipelineId,
      ),
      fetchSourcesCatalogCached(url),
      getStageConfigs(),
    ]);
    const sourceMap = new Map(sourceCat.map((s) => [s.id, s.name]));

    const scopedDeals = filters.stageIds?.length
      ? deals.filter((d) => filters.stageIds!.includes(String(d.STAGE_ID ?? "")))
      : deals;

    const isWon = (d: typeof scopedDeals[number]) =>
      stageConfigs.length > 0
        ? dealAnalyticsType(d, stageConfigs, wonStageIds) === "won"
        : dealIsWon(d, wonStageIds);
    const isLost = (d: typeof scopedDeals[number]) =>
      stageConfigs.length > 0
        ? dealAnalyticsType(d, stageConfigs, wonStageIds) === "lost"
        : dealIsLost(d);

    const grouped = new Map<string, { total: number; won: number; lost: number }>();
    for (const d of scopedDeals) {
      const raw = String(d.SOURCE_ID ?? "").trim();
      if (!raw) continue;
      const source = resolveBitrixSourceLabel(d.SOURCE_ID, sourceMap);
      const cur = grouped.get(source) ?? { total: 0, won: 0, lost: 0 };
      cur.total += 1;
      if (isWon(d)) cur.won += 1;
      else if (isLost(d)) cur.lost += 1;
      grouped.set(source, cur);
    }

    const sources = Array.from(grouped.entries())
      .map(([source, v]) => ({
        source,
        count: v.total,
        won: v.won,
        lost: v.lost,
        conv: v.total > 0 ? Math.round((v.won / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
    return jsonOk({ sources });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
