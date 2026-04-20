import { jsonError, jsonOk } from "@/lib/http/json";
import { parseDashboardFilters } from "@/lib/dashboard/dashboard-query";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import {
  dealIsLost,
  dealIsWon,
  parseOpportunity,
} from "@/lib/bitrix/api";
import { fetchDealsCached, fetchManagersCached } from "@/lib/bitrix/cache";
import { getOrSyncWonStageIds } from "@/lib/bitrix/won-stages";

export const dynamic = "force-dynamic";

/**
 * В этом портале Bitrix24 почти не используются entity Lead — весь поток идёт
 * сразу в сделки. Поэтому «лид» на дашборде = сделка любой стадии.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filters = parseDashboardFilters(searchParams);

    const conn = await getActiveBitrixConnection();
    const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
    if (!url) return jsonOk({ metrics: null });

    const dateFrom = filters.start.toISOString().slice(0, 10);
    const dateTo = filters.end.toISOString().slice(0, 10);

    const [wonStageIds, deals, managers] = await Promise.all([
      getOrSyncWonStageIds(url),
      fetchDealsCached(url, dateFrom, dateTo, filters.managerIds, filters.pipelineId),
      fetchManagersCached(url),
    ]);

    const scopedDeals = filters.stageIds?.length
      ? deals.filter((d) => filters.stageIds!.includes(String(d.STAGE_ID ?? "")))
      : deals;

    const wonDeals = scopedDeals.filter((d) => dealIsWon(d, wonStageIds));
    const lostDeals = scopedDeals.filter((d) => dealIsLost(d));
    const activeDeals = scopedDeals.filter(
      (d) => !dealIsWon(d, wonStageIds) && !dealIsLost(d),
    );

    const totalLeads = scopedDeals.length;
    // «Новый» = создан сегодня (в пределах выбранного периода)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const newLeads = scopedDeals.filter((d) => {
      const ts = Date.parse(String(d.DATE_CREATE ?? ""));
      return Number.isFinite(ts) && ts >= todayStart.getTime();
    }).length;

    const won = wonDeals.length;
    const lost = lostDeals.length;
    const conversion = totalLeads > 0 ? Math.round((won / totalLeads) * 100) : 0;
    const lostRate = totalLeads > 0 ? Math.round((lost / totalLeads) * 100) : 0;

    const closeDays = wonDeals
      .map((d) => {
        const created = Date.parse(String(d.DATE_CREATE ?? ""));
        const closed = Date.parse(String(d.CLOSEDATE ?? d.DATE_CREATE ?? ""));
        if (!Number.isFinite(created) || !Number.isFinite(closed)) return null;
        return Math.max(0, Math.round((closed - created) / 86400000));
      })
      .filter((n): n is number => n != null);
    const avgCloseDays = closeDays.length
      ? Math.round(closeDays.reduce((s, x) => s + x, 0) / closeDays.length)
      : 0;

    const staleLeads = activeDeals.filter((d) => {
      const created = Date.parse(String(d.DATE_CREATE ?? ""));
      if (!Number.isFinite(created)) return false;
      return (Date.now() - created) / 86400000 > 3;
    }).length;

    const speedByManager = new Map<string, { days: number; count: number }>();
    for (const d of wonDeals) {
      const id = String(d.ASSIGNED_BY_ID ?? "");
      if (!id) continue;
      const created = Date.parse(String(d.DATE_CREATE ?? ""));
      const closed = Date.parse(String(d.CLOSEDATE ?? d.DATE_CREATE ?? ""));
      if (!Number.isFinite(created) || !Number.isFinite(closed)) continue;
      const days = Math.max(0, (closed - created) / 86400000);
      const cur = speedByManager.get(id) ?? { days: 0, count: 0 };
      cur.days += days;
      cur.count += 1;
      speedByManager.set(id, cur);
    }
    const fastest = Array.from(speedByManager.entries())
      .map(([id, v]) => ({ id, avg: v.count ? v.days / v.count : Infinity }))
      .sort((a, b) => a.avg - b.avg)[0];
    const fastestName = fastest
      ? managers.find((m) => m.id === fastest.id)?.name ?? fastest.id
      : null;

    const metrics = {
      totalLeads,
      newLeads,
      inProgress: activeDeals.length,
      won,
      conversion,
      lost,
      lostRate,
      wonAmount: wonDeals.reduce((s, d) => s + parseOpportunity(d.OPPORTUNITY), 0),
      avgFirstContactHours: 0, // недоступно на уровне сделок в Bitrix
      avgCloseDays,
      staleLeads,
      fastestManager: fastestName,
    };
    return jsonOk({ metrics });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
