import {
  BitrixAPI,
  dealAnalyticsType,
  dealIsLost,
  dealIsProgress,
  dealIsWon,
  getStageConfigs,
  leadIsLost,
  leadIsWon,
  parseOpportunity,
  type BitrixDeal,
} from "@/lib/bitrix/api";
import {
  fetchDealsCached,
  fetchLeadsCached,
  fetchLostReasonsCached,
  fetchPipelinesCached,
  fetchSourcesCatalogCached,
} from "@/lib/bitrix/cache";
import { resolveBitrixSourceLabel } from "@/lib/bitrix/bitrix-labels";
import {
  ensureBitrixLeadDictionaries,
  mergeBitrixDictionaryMaps,
} from "@/lib/bitrix/crm-dictionary";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { getOrSyncWonStageIds } from "@/lib/bitrix/won-stages";
import type { DashboardFilters } from "@/lib/dashboard/dashboard-query";

export type DealFinancialSlice = { count: number; sum: number };

export type DashboardOverview = {
  general: {
    totalDeals: number;
    activePipelines: number;
    leadsInPeriod: number;
  };
  leads: {
    total: number;
    won: number;
    lost: number;
    salesAmount: number;
  };
  deals: {
    progress: DealFinancialSlice;
    won: DealFinancialSlice;
    lost: DealFinancialSlice;
  };
  failReasons: { name: string; count: number }[];
  sources: { name: string; count: number }[];
};

function topSevenPlusOther(
  entries: { name: string; count: number }[],
): { name: string; count: number }[] {
  const sorted = [...entries].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, 7);
  const rest = sorted.slice(7).reduce((s, x) => s + x.count, 0);
  if (rest > 0) {
    top.push({ name: "Другое", count: rest });
  }
  return top;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sliceDeals(
  deals: BitrixDeal[],
  pred: (d: BitrixDeal) => boolean,
): DealFinancialSlice {
  const filtered = deals.filter(pred);
  return {
    count: filtered.length,
    sum: filtered.reduce((s, d) => s + parseOpportunity(d.OPPORTUNITY), 0),
  };
}

export async function getDashboardOverview(
  filters: DashboardFilters,
  webhookUrl: string,
): Promise<DashboardOverview | null> {
  const dateFrom = ymd(filters.start);
  const dateTo = ymd(filters.end);
  const mids = filters.managerIds;
  const stageFilter = filters.stageIds ? new Set(filters.stageIds) : null;

  await ensureBitrixLeadDictionaries(webhookUrl);

  const api = new BitrixAPI(webhookUrl);
  const [wonStageIds, stageConfigs, leads, wonLeadsByCloseDate, deals, pipelines, lostCat, srcCat] =
    await Promise.all([
      getOrSyncWonStageIds(webhookUrl),
      getStageConfigs(),
      fetchLeadsCached(webhookUrl, dateFrom, dateTo, mids),
      api.getLeads({
        dateFrom,
        dateTo,
        managerIds: mids,
        dateField: "DATE_CLOSED",
        statusSemanticId: "S",
      }),
      fetchDealsCached(
        webhookUrl,
        dateFrom,
        dateTo,
        mids,
        filters.pipelineId,
      ),
      fetchPipelinesCached(webhookUrl),
      fetchLostReasonsCached(webhookUrl),
      fetchSourcesCatalogCached(webhookUrl),
    ]);

  const { lostMap, srcMap } = await mergeBitrixDictionaryMaps(
    new Map(lostCat.map((x) => [String(x.id).toUpperCase(), x.name])),
    new Map(srcCat.map((x) => [String(x.id).toUpperCase(), x.name])),
  );

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

  const scopedDeals = stageFilter
    ? deals.filter((d) => stageFilter.has(String(d.STAGE_ID ?? "")))
    : deals;
  const wonLeads = scopedWonLeadsByCloseDate.filter(leadIsWon);
  const lostLeads = scopedLeads.filter(leadIsLost);
  const leadSalesFromWon = wonLeads.reduce(
    (s, l) => s + parseOpportunity(l.OPPORTUNITY),
    0,
  );
  const dealWonSum = scopedDeals
    .filter((d) =>
      stageConfigs.length > 0
        ? dealAnalyticsType(d, stageConfigs, wonStageIds) === "won"
        : dealIsWon(d, wonStageIds),
    )
    .reduce((s, d) => s + parseOpportunity(d.OPPORTUNITY), 0);

  // Источники и причины отказа — из сделок (кастомные источники типа Whatsapp, Таргет и т.д.)
  const failRaw = new Map<string, number>();
  for (const d of scopedDeals) {
    if (d.STAGE_SEMANTIC_ID !== "F") continue;
    const raw = (d.LOSS_REASON_ID ?? "").toString().trim();
    const rid = raw || "unknown";
    failRaw.set(rid, (failRaw.get(rid) ?? 0) + 1);
  }
  const failReasons = topSevenPlusOther(
    Array.from(failRaw.entries()).map(([id, count]) => ({
      name:
        id === "unknown"
          ? "Не указана"
          : (lostMap.get(id.toUpperCase()) ?? lostMap.get(id) ?? `Причина ${id}`),
      count,
    })),
  );

  const srcRaw = new Map<string, number>();
  for (const d of scopedDeals) {
    const label = resolveBitrixSourceLabel(d.SOURCE_ID, srcMap);
    srcRaw.set(label, (srcRaw.get(label) ?? 0) + 1);
  }
  const sources = topSevenPlusOther(
    Array.from(srcRaw.entries()).map(([name, count]) => ({
      name,
      count,
    })),
  );

  const activePipelines = filters.pipelineId
    ? pipelines.filter((p) => p.id === filters.pipelineId).length || 1
    : pipelines.length;

  return {
    general: {
      totalDeals: scopedDeals.length,
      activePipelines,
      leadsInPeriod: scopedLeads.length,
    },
    leads: {
      total: scopedLeads.length,
      won: wonLeads.length,
      lost: lostLeads.length,
      salesAmount: leadSalesFromWon + dealWonSum,
    },
    deals: {
      progress: sliceDeals(
        scopedDeals,
        (d) =>
          stageConfigs.length > 0
            ? dealAnalyticsType(d, stageConfigs, wonStageIds) === "progress"
            : dealIsProgress(d, wonStageIds),
      ),
      won: sliceDeals(
        scopedDeals,
        (d) =>
          stageConfigs.length > 0
            ? dealAnalyticsType(d, stageConfigs, wonStageIds) === "won"
            : dealIsWon(d, wonStageIds),
      ),
      lost: sliceDeals(
        scopedDeals,
        (d) =>
          stageConfigs.length > 0
            ? dealAnalyticsType(d, stageConfigs, wonStageIds) === "lost"
            : dealIsLost(d),
      ),
    },
    failReasons,
    sources,
  };
}

export type FunnelStageApi = {
  name: string;
  count: number;
  amount: number;
};

export type FunnelApi = {
  id: string;
  name: string;
  totalDeals: number;
  stages: FunnelStageApi[];
};

export async function getDashboardFunnels(
  filters: DashboardFilters,
  webhookUrl: string,
): Promise<FunnelApi[]> {
  const dateFrom = ymd(filters.start);
  const dateTo = ymd(filters.end);
  const mids = filters.managerIds;
  const stageFilter = filters.stageIds ? new Set(filters.stageIds) : null;

  const pipelines = await fetchPipelinesCached(webhookUrl);
  const pipelinesToShow = filters.pipelineId
    ? pipelines.filter((p) => p.id === filters.pipelineId)
    : pipelines;

  const out: FunnelApi[] = [];

  for (const p of pipelinesToShow) {
    const dealsRaw = await fetchDealsCached(
      webhookUrl,
      dateFrom,
      dateTo,
      mids,
      p.id,
    );
    const deals = stageFilter
      ? dealsRaw.filter((d) => stageFilter.has(String(d.STAGE_ID ?? "")))
      : dealsRaw;

    const byStage = new Map<string, { count: number; amount: number }>();
    for (const d of deals) {
      const k = (d.STAGE_ID ?? "__none__").toString();
      const cur = byStage.get(k) ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += parseOpportunity(d.OPPORTUNITY);
      byStage.set(k, cur);
    }

    const stageRows: FunnelStageApi[] = p.stages.map((s) => {
      const agg = byStage.get(s.statusId);
      return {
        name: s.name,
        count: agg?.count ?? 0,
        amount: agg?.amount ?? 0,
      };
    });

    const listed = new Set(p.stages.map((s) => s.statusId));
    let noneSum = { count: 0, amount: 0 };
    for (const [k, v] of Array.from(byStage.entries())) {
      if (k === "__none__" || !listed.has(k)) {
        noneSum = {
          count: noneSum.count + v.count,
          amount: noneSum.amount + v.amount,
        };
      }
    }
    if (noneSum.count > 0) {
      stageRows.push({
        name: "Прочие стадии",
        count: noneSum.count,
        amount: noneSum.amount,
      });
    }

    out.push({
      id: p.id,
      name: p.name,
      totalDeals: deals.length,
      stages: stageRows,
    });
  }

  return out;
}

/** Обёртка: webhook из активного подключения Bitrix24. */
export async function getDashboardOverviewResolved(
  filters: DashboardFilters,
): Promise<{ overview: DashboardOverview | null; hasCrm: boolean; error?: string }> {
  const active = await getActiveBitrixConnection();
  const url = active ? getBitrixWebhookBaseUrl(active) : null;
  if (!active || !url) {
    return { overview: null, hasCrm: false };
  }
  try {
    const overview = await getDashboardOverview(filters, url);
    return { overview, hasCrm: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "CRM недоступна";
    return { overview: null, hasCrm: true, error: msg };
  }
}

export async function getDashboardFunnelsResolved(
  filters: DashboardFilters,
): Promise<{ funnels: FunnelApi[]; error?: string }> {
  const active = await getActiveBitrixConnection();
  const url = active ? getBitrixWebhookBaseUrl(active) : null;
  if (!active || !url) {
    return { funnels: [] };
  }
  try {
    const funnels = await getDashboardFunnels(filters, url);
    return { funnels };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "CRM недоступна";
    return { funnels: [], error: msg };
  }
}
