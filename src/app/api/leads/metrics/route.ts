import { jsonError, jsonOk } from "@/lib/http/json";
import { parseDashboardFilters } from "@/lib/dashboard/dashboard-query";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import {
  BitrixAPI,
  dealIsLost,
  dealIsWon,
  leadIsLost,
  leadIsWon,
  parseOpportunity,
} from "@/lib/bitrix/api";
import { fetchDealsCached, fetchLeadsCached, fetchManagersCached } from "@/lib/bitrix/cache";
import { getOrSyncWonStageIds } from "@/lib/bitrix/won-stages";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filters = parseDashboardFilters(searchParams);

    const conn = await getActiveBitrixConnection();
    const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
    if (!url) return jsonOk({ metrics: null });

    const api = new BitrixAPI(url);
    const [wonStageIds, leads, wonLeadsByCloseDate, deals, managers] = await Promise.all([
      getOrSyncWonStageIds(url),
      fetchLeadsCached(url, filters.start.toISOString().slice(0, 10), filters.end.toISOString().slice(0, 10), filters.managerIds),
      api.getLeads({
        dateFrom: filters.start.toISOString().slice(0, 10),
        dateTo: filters.end.toISOString().slice(0, 10),
        managerIds: filters.managerIds,
        dateField: "DATE_CLOSED",
        statusSemanticId: "S",
      }),
      fetchDealsCached(url, filters.start.toISOString().slice(0, 10), filters.end.toISOString().slice(0, 10), filters.managerIds, filters.pipelineId),
      fetchManagersCached(url),
    ]);
    const scopedLeads = filters.pipelineId
      ? leads.filter(
          (l) =>
            String((l as { CATEGORY_ID?: string }).CATEGORY_ID ?? "") ===
            filters.pipelineId,
        )
      : leads;
    const scopedWonLeadsByCloseDate = filters.pipelineId
      ? wonLeadsByCloseDate.filter(
          (l) =>
            String((l as { CATEGORY_ID?: string }).CATEGORY_ID ?? "") ===
            filters.pipelineId,
        )
      : wonLeadsByCloseDate;

    const scopedDeals = filters.stageIds?.length
      ? deals.filter((d) => filters.stageIds!.includes(String(d.STAGE_ID ?? "")))
      : deals;
    const wonDeals = scopedDeals.filter((d) => dealIsWon(d, wonStageIds));
    const lostDeals = scopedDeals.filter((d) => dealIsLost(d));
    const activeDeals = scopedDeals.filter((d) => !dealIsWon(d, wonStageIds) && !dealIsLost(d));

    const totalLeads = scopedLeads.length;
    const newLeads = scopedLeads.filter((l) => String(l.STATUS_ID ?? "").toUpperCase() === "NEW").length;
    const wonLeads = scopedWonLeadsByCloseDate.filter(leadIsWon).length;
    const lostLeads = scopedLeads.filter(leadIsLost).length;
    const conversion = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;
    const lostRate = totalLeads > 0 ? Math.round((lostLeads / totalLeads) * 100) : 0;

    const firstContactHours = scopedLeads
      .map((l) => {
        const created = Date.parse(String((l as { CREATED_TIME?: string }).CREATED_TIME ?? l.DATE_CREATE ?? ""));
        const modified = Date.parse(String((l as { DATE_MODIFY?: string }).DATE_MODIFY ?? l.CLOSED_TIME ?? l.DATE_CREATE ?? ""));
        if (!Number.isFinite(created) || !Number.isFinite(modified)) return null;
        return Math.max(0, Math.round((modified - created) / 36e5));
      })
      .filter((n): n is number => n != null);
    const avgFirstContactHours = firstContactHours.length
      ? Math.round(firstContactHours.reduce((s, x) => s + x, 0) / firstContactHours.length)
      : 0;

    const closeDays = wonDeals
      .map((d) => {
        const created = Date.parse(String(d.DATE_CREATE ?? ""));
        const closed = Date.parse(String(d.CLOSEDATE ?? d.DATE_CREATE ?? ""));
        if (!Number.isFinite(created) || !Number.isFinite(closed)) return null;
        return Math.max(0, Math.round((closed - created) / 86400000));
      })
      .filter((n): n is number => n != null);
    const avgCloseDays = closeDays.length ? Math.round(closeDays.reduce((s, x) => s + x, 0) / closeDays.length) : 0;

    const staleLeads = scopedLeads.filter((l) => {
      const created = Date.parse(String((l as { CREATED_TIME?: string }).CREATED_TIME ?? l.DATE_CREATE ?? ""));
      if (!Number.isFinite(created)) return false;
      return (Date.now() - created) / 86400000 > 3 && !leadIsWon(l) && !leadIsLost(l);
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
    const fastestName = fastest ? managers.find((m) => m.id === fastest.id)?.name ?? fastest.id : null;

    const metrics = {
      totalLeads,
      newLeads,
      inProgress: activeDeals.length,
      won: wonLeads,
      conversion,
      lost: lostLeads,
      lostRate,
      wonAmount: wonDeals.reduce((s, d) => s + parseOpportunity(d.OPPORTUNITY), 0),
      avgFirstContactHours,
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
