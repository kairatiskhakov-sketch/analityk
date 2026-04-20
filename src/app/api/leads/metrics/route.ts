import { jsonError, jsonOk } from "@/lib/http/json";
import { parseDashboardFilters } from "@/lib/dashboard/dashboard-query";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import {
  dealAnalyticsType,
  dealIsLost,
  dealIsWon,
  getStageConfigs,
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

    const [wonStageIds, deals, managers, stageConfigs] = await Promise.all([
      getOrSyncWonStageIds(url),
      fetchDealsCached(url, dateFrom, dateTo, filters.managerIds, filters.pipelineId),
      fetchManagersCached(url),
      getStageConfigs(),
    ]);

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

    const wonDeals = scopedDeals.filter(isWon);
    const lostDeals = scopedDeals.filter(isLost);
    const activeDeals = scopedDeals.filter((d) => !isWon(d) && !isLost(d));

    const totalLeads = scopedDeals.length;
    // «Новый» = сделка без закрытия, не в стадии won/lost.
    // Если период включает сегодня — считаем только созданные сегодня.
    // Иначе — считаем активные сделки, которые были созданы в последний день периода.
    const now = new Date();
    const periodIncludesToday = filters.end.getTime() >= now.setHours(0, 0, 0, 0);
    const anchorStart = periodIncludesToday
      ? new Date().setHours(0, 0, 0, 0)
      : new Date(filters.end).setHours(0, 0, 0, 0);
    const newLeads = scopedDeals.filter((d) => {
      if (isWon(d) || isLost(d)) return false;
      const ts = Date.parse(String(d.DATE_CREATE ?? ""));
      return Number.isFinite(ts) && ts >= anchorStart;
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

    // Ежедневная серия — от всех сделок в периоде, не от страницы таблицы
    const dailyBucket = new Map<string, { leads: number; won: number; lost: number }>();
    for (const d of scopedDeals) {
      const day = String(d.DATE_CREATE ?? "").slice(0, 10);
      if (!day) continue;
      const cur = dailyBucket.get(day) ?? { leads: 0, won: 0, lost: 0 };
      cur.leads += 1;
      if (isWon(d)) cur.won += 1;
      else if (isLost(d)) cur.lost += 1;
      dailyBucket.set(day, cur);
    }
    const series = Array.from(dailyBucket.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Полный список менеджеров, у которых есть сделки в периоде
    const managerIdsInPeriod = new Set<string>();
    for (const d of scopedDeals) {
      const id = String(d.ASSIGNED_BY_ID ?? "");
      if (id) managerIdsInPeriod.add(id);
    }
    const managerList = Array.from(managerIdsInPeriod)
      .map((id) => ({ id, name: managers.find((m) => m.id === id)?.name ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));

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
    return jsonOk({ metrics, series, managers: managerList });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
