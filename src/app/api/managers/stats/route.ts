import {
  dealIsLost,
  dealIsWon,
  leadIsLost,
  parseOpportunity,
  type BitrixDeal,
  type BitrixLead,
} from "@/lib/bitrix/api";
import {
  fetchDealsCached,
  fetchLeadsCached,
  fetchLostReasonsCached,
  fetchManagersCached,
  fetchPipelinesCached,
  fetchSourcesCatalogCached,
} from "@/lib/bitrix/cache";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { getOrSyncWonStageIds } from "@/lib/bitrix/won-stages";
import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseIds(raw: string | null) {
  return raw?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
}

function parseDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts);
}

function getPreviousRange(dateFrom: string, dateTo: string) {
  const start = new Date(`${dateFrom}T00:00:00`);
  const end = new Date(`${dateTo}T23:59:59`);
  const ms = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - ms);
  return { prevFrom: ymd(prevStart), prevTo: ymd(prevEnd) };
}

function groupTop<T extends string>(items: T[]): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const x of items) map.set(x, (map.get(x) ?? 0) + 1);
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const managerIds = parseIds(searchParams.get("managerIds") ?? searchParams.get("managers"));
    const pipelineId = searchParams.get("pipelineId")?.trim() || undefined;
    if (!dateFrom || !dateTo) return jsonError("Укажите dateFrom и dateTo", 400);

    const conn = await getActiveBitrixConnection();
    const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
    if (!url) {
      return jsonOk({ kpi: null, managers: [], compare: [], error: null });
    }

    try {
      const { prevFrom, prevTo } = getPreviousRange(dateFrom, dateTo);
      const [wonStageIds, leads, deals, prevDeals, managers, sourceCat, failCat, pipelines, dbManagers, planRows] = await Promise.all([
        getOrSyncWonStageIds(url),
        fetchLeadsCached(url, dateFrom, dateTo, managerIds.length ? managerIds : undefined),
        fetchDealsCached(url, dateFrom, dateTo, managerIds.length ? managerIds : undefined, pipelineId),
        fetchDealsCached(url, prevFrom, prevTo, managerIds.length ? managerIds : undefined, pipelineId),
        fetchManagersCached(url),
        fetchSourcesCatalogCached(url),
        fetchLostReasonsCached(url),
        fetchPipelinesCached(url),
        prisma.manager.findMany({ where: { crmType: "bitrix24", isActive: true }, select: { id: true, externalId: true, name: true } }),
        prisma.planTarget.findMany({
          where: {
            period: `${new Date(`${dateTo}T00:00:00`).getFullYear()}-${String(new Date(`${dateTo}T00:00:00`).getMonth() + 1).padStart(2, "0")}`,
            periodType: "month",
          },
          select: { managerId: true, target: true },
        }),
      ]);

      const sourceMap = new Map(sourceCat.map((x) => [x.id, x.name]));
      const failMap = new Map(failCat.map((x) => [x.id, x.name]));
      const managerNameByExt = new Map(managers.map((m) => [m.id, m.name]));
      const dbByExt = new Map(dbManagers.map((m) => [m.externalId, m]));
      const planByManagerId = new Map(planRows.filter((x) => x.managerId).map((x) => [x.managerId!, x.target]));

      const scopedDeals = pipelineId
        ? deals.filter((d) => String(d.CATEGORY_ID ?? "") === pipelineId)
        : deals;
      const scopedPrevDeals = pipelineId
        ? prevDeals.filter((d) => String(d.CATEGORY_ID ?? "") === pipelineId)
        : prevDeals;

      const byManager = new Map<string, {
        leads: BitrixLead[];
        wonDeals: BitrixDeal[];
        lostDeals: BitrixDeal[];
        activeDeals: BitrixDeal[];
      }>();
      const ensure = (id: string) => {
        if (!byManager.has(id)) byManager.set(id, { leads: [], wonDeals: [], lostDeals: [], activeDeals: [] });
        return byManager.get(id)!;
      };

      for (const l of leads) {
        const id = String(l.ASSIGNED_BY_ID ?? "");
        if (!id) continue;
        ensure(id).leads.push(l);
      }
      for (const d of scopedDeals) {
        const id = String(d.ASSIGNED_BY_ID ?? "");
        if (!id) continue;
        const x = ensure(id);
        if (dealIsWon(d, wonStageIds)) x.wonDeals.push(d);
        else if (dealIsLost(d)) x.lostDeals.push(d);
        else x.activeDeals.push(d);
      }

      const prevWonAmountByManager = new Map<string, number>();
      for (const d of scopedPrevDeals) {
        if (!dealIsWon(d, wonStageIds)) continue;
        const id = String(d.ASSIGNED_BY_ID ?? "");
        if (!id) continue;
        prevWonAmountByManager.set(id, (prevWonAmountByManager.get(id) ?? 0) + parseOpportunity(d.OPPORTUNITY));
      }

      const managerRows = Array.from(byManager.entries()).map(([extId, agg]) => {
        const totalLeads = agg.leads.length;
        const wonDeals = agg.wonDeals.length;
        const lostDeals = agg.lostDeals.length;
        const activeDeals = agg.activeDeals.length;
        const totalAmount = agg.wonDeals.reduce((s, d) => s + parseOpportunity(d.OPPORTUNITY), 0);
        const avgDeal = wonDeals > 0 ? totalAmount / wonDeals : 0;
        const conversion = totalLeads > 0 ? Math.round((wonDeals / totalLeads) * 100) : 0;

        const closeDays = agg.wonDeals
          .map((d) => {
            const c = parseDate(d.CLOSEDATE);
            const cr = parseDate(d.DATE_CREATE);
            if (!c || !cr) return null;
            return Math.max(0, Math.round((c.getTime() - cr.getTime()) / 86400000));
          })
          .filter((n): n is number => n != null);
        const avgCloseDays = closeDays.length ? Math.round(closeDays.reduce((s, x) => s + x, 0) / closeDays.length) : 0;

        const topSources = groupTop(
          agg.leads.map((l) => sourceMap.get(String(l.SOURCE_ID ?? "")) ?? `Источник ${String(l.SOURCE_ID ?? "unknown")}`),
        );
        const topFailReasons = groupTop(
          agg.leads
            .filter((l) => leadIsLost(l))
            .map((l) => failMap.get(String(l.LOST_REASON_ID ?? "")) ?? `Причина ${String(l.LOST_REASON_ID ?? "unknown")}`),
        );

        const byPipelineMap = new Map<string, { deals: number; amount: number }>();
        for (const d of agg.wonDeals) {
          const pid = String(d.CATEGORY_ID ?? "0");
          const cur = byPipelineMap.get(pid) ?? { deals: 0, amount: 0 };
          cur.deals += 1;
          cur.amount += parseOpportunity(d.OPPORTUNITY);
          byPipelineMap.set(pid, cur);
        }
        const byPipeline = Array.from(byPipelineMap.entries()).map(([pid, v]) => ({
          pipelineId: pid,
          pipelineName: pipelines.find((p) => p.id === pid)?.name ?? `Воронка ${pid}`,
          deals: v.deals,
          amount: v.amount,
        })).sort((a, b) => b.amount - a.amount);

        const prevAmount = prevWonAmountByManager.get(extId) ?? 0;
        const trendPct = prevAmount > 0 ? Math.round(((totalAmount - prevAmount) / prevAmount) * 100) : (totalAmount > 0 ? 100 : 0);
        const dbMgr = dbByExt.get(extId);
        const plan = dbMgr ? (planByManagerId.get(dbMgr.id) ?? null) : null;
        const planProgress = plan && plan > 0 ? Math.round((totalAmount / plan) * 100) : null;

        return {
          id: dbMgr?.id ?? extId,
          externalId: extId,
          name: managerNameByExt.get(extId) ?? dbMgr?.name ?? extId,
          totalLeads,
          wonDeals,
          lostDeals,
          activeDeals,
          totalAmount,
          avgDeal,
          conversion,
          avgCloseDays,
          failRate: totalLeads > 0 ? Math.round((lostDeals / totalLeads) * 100) : 0,
          topSources,
          topFailReasons,
          byPipeline,
          trendPct,
          plan,
          planProgress,
        };
      }).sort((a, b) => b.totalAmount - a.totalAmount);

      const best = managerRows[0] ?? null;
      const kpi = {
        activeManagers: managerRows.length,
        bestManager: best ? { name: best.name, amount: best.totalAmount } : null,
        avgConversion: managerRows.length ? Math.round(managerRows.reduce((s, m) => s + m.conversion, 0) / managerRows.length) : 0,
        avgCloseDays: managerRows.length ? Math.round(managerRows.reduce((s, m) => s + m.avgCloseDays, 0) / managerRows.length) : 0,
      };
      const compare = managerRows.map((m) => ({
        managerId: m.id,
        name: m.name,
        current: m.totalAmount,
        previous: prevWonAmountByManager.get(m.externalId) ?? 0,
        changePct:
          (prevWonAmountByManager.get(m.externalId) ?? 0) > 0
            ? Math.round(((m.totalAmount - (prevWonAmountByManager.get(m.externalId) ?? 0)) / (prevWonAmountByManager.get(m.externalId) ?? 1)) * 100)
            : (m.totalAmount > 0 ? 100 : 0),
      }));

      return jsonOk({ kpi, managers: managerRows, compare, error: null });
    } catch {
      return jsonOk({ kpi: null, managers: [], compare: [], error: "CRM недоступна", data: null });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
