import {
  BITRIX_LOSS_REASON_FIELD,
  dealIsLost,
  parseOpportunity,
  type BitrixDeal,
  type BitrixLead,
} from "@/lib/bitrix/api";
import { resolveBitrixSourceLabel } from "@/lib/bitrix/bitrix-labels";
import {
  fetchDealUserfieldDictCached,
  fetchDealsCached,
  fetchLeadsCached,
  fetchManagersCached,
  fetchPipelinesCached,
  fetchSourcesCatalogCached,
} from "@/lib/bitrix/cache";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { fetchNewSalesForPeriod } from "@/lib/bitrix/stage-history-sales";
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
      // Параллельно: stagehistory-продажи за текущий и прошлый периоды +
      // остальные данные (лиды, сделки по DATE_CREATE для active/lost, справочники).
      const [
        salesCur,
        salesPrev,
        leads,
        deals,
        managers,
        sourceCat,
        lossReasonUfDict,
        pipelines,
        dbManagers,
        planRows,
      ] = await Promise.all([
        fetchNewSalesForPeriod(url, dateFrom, dateTo),
        fetchNewSalesForPeriod(url, prevFrom, prevTo),
        fetchLeadsCached(url, dateFrom, dateTo, managerIds.length ? managerIds : undefined),
        fetchDealsCached(url, dateFrom, dateTo, managerIds.length ? managerIds : undefined, pipelineId),
        fetchManagersCached(url),
        fetchSourcesCatalogCached(url),
        fetchDealUserfieldDictCached(url, BITRIX_LOSS_REASON_FIELD),
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
      const managerNameByExt = new Map(managers.map((m) => [m.id, m.name]));
      const dbByExt = new Map(dbManagers.map((m) => [m.externalId, m]));
      const planByManagerId = new Map(planRows.filter((x) => x.managerId).map((x) => [x.managerId!, x.target]));

      const scopedDeals = pipelineId
        ? deals.filter((d) => String(d.CATEGORY_ID ?? "") === pipelineId)
        : deals;

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
      // Won deals — из stagehistory (первый переход в продажную стадию в периоде)
      for (const d of salesCur.wonDeals) {
        const id = String(d.ASSIGNED_BY_ID ?? "");
        if (!id) continue;
        if (pipelineId && String(d.CATEGORY_ID ?? "") !== pipelineId) continue;
        ensure(id).wonDeals.push(d);
      }
      // Active/lost — сделки, созданные в периоде, которые НЕ являются продажами
      for (const d of scopedDeals) {
        const id = String(d.ASSIGNED_BY_ID ?? "");
        if (!id) continue;
        if (salesCur.wonDealIds.has(String(d.ID ?? ""))) continue;
        const x = ensure(id);
        if (dealIsLost(d)) x.lostDeals.push(d);
        else x.activeDeals.push(d);
      }

      // Предыдущий период — суммы продаж для тренда
      const prevWonAmountByManager = new Map<string, number>();
      for (const d of salesPrev.wonDeals) {
        const id = String(d.ASSIGNED_BY_ID ?? "");
        if (!id) continue;
        if (pipelineId && String(d.CATEGORY_ID ?? "") !== pipelineId) continue;
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

        const allDeals = [...agg.wonDeals, ...agg.lostDeals, ...agg.activeDeals];
        const topSources = groupTop(
          allDeals
            .filter((d) => (d.SOURCE_ID ?? "").toString().trim() !== "")
            .map((d) => resolveBitrixSourceLabel(d.SOURCE_ID, sourceMap)),
        );
        const topFailReasons = groupTop(
          agg.lostDeals
            .map((d) => {
              const uf = String(
                (d as unknown as Record<string, unknown>)[BITRIX_LOSS_REASON_FIELD] ?? "",
              ).trim();
              if (uf && uf !== "0") {
                return lossReasonUfDict.get(uf) ?? `Причина ${uf}`;
              }
              const lr = String(d.LOSS_REASON_ID ?? "").trim();
              return lr ? `Причина ${lr}` : "Не указана";
            }),
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
