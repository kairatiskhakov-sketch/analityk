import {
  autoDetectStageType,
  dealAnalyticsType,
  dealIsWon,
  getStageConfigs,
  leadIsLost,
  leadIsWon,
  parseOpportunity,
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

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function getWebhook(): Promise<string | null> {
  const conn = await getActiveBitrixConnection();
  if (!conn) return null;
  return getBitrixWebhookBaseUrl(conn);
}

export async function getLeadMetrics(
  start: Date,
  end: Date,
  _connectionId?: string | null,
  managerIds?: string[],
) {
  const url = await getWebhook();
  if (!url) {
    return {
      total: 0,
      won: 0,
      lost: 0,
      inProgress: 0,
      salesAmount: 0,
    };
  }

  const df = ymd(start);
  const dt = ymd(end);
  const [wonStageIds, stageConfigs, leads, deals] = await Promise.all([
    getOrSyncWonStageIds(url),
    getStageConfigs(),
    fetchLeadsCached(url, df, dt, managerIds),
    fetchDealsCached(url, df, dt, managerIds),
  ]);

  const won = leads.filter(leadIsWon);
  const lost = leads.filter(leadIsLost);
  const inProgress = leads.filter((l) => !leadIsWon(l) && !leadIsLost(l));
  const leadSales = won.reduce((s, l) => s + parseOpportunity(l.OPPORTUNITY), 0);
  const dealSales = deals
    .filter((d) =>
      stageConfigs.length > 0
        ? dealAnalyticsType(d, stageConfigs, wonStageIds) === "won"
        : dealIsWon(d, wonStageIds),
    )
    .reduce((s, d) => s + parseOpportunity(d.OPPORTUNITY), 0);

  return {
    total: leads.length,
    won: won.length,
    lost: lost.length,
    inProgress: inProgress.length,
    salesAmount: leadSales + dealSales,
  };
}

export async function leadsBySource(
  start: Date,
  end: Date,
  _connectionId?: string | null,
  managerIds?: string[],
) {
  const url = await getWebhook();
  if (!url) return [];

  await ensureBitrixLeadDictionaries(url);

  const df = ymd(start);
  const dt = ymd(end);
  const [leads, catalog] = await Promise.all([
    fetchLeadsCached(url, df, dt, managerIds),
    fetchSourcesCatalogCached(url),
  ]);
  const { srcMap: mapNames } = await mergeBitrixDictionaryMaps(
    new Map<string, string>(),
    new Map(catalog.map((x) => [x.id, x.name])),
  );
  const counts = new Map<string, number>();
  for (const l of leads) {
    const label = resolveBitrixSourceLabel(l.SOURCE_ID, mapNames);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([source, count]) => ({
    source,
    count,
  }));
}

export async function funnelCounts(
  start: Date,
  end: Date,
  _connectionId?: string | null,
  managerIds?: string[],
) {
  const url = await getWebhook();
  if (!url) {
    return { new: 0, in_progress: 0, won: 0, lost: 0 };
  }
  const df = ymd(start);
  const dt = ymd(end);
  const leads = await fetchLeadsCached(url, df, dt, managerIds);
  return {
    new: leads.filter((l) => (l.STATUS_ID ?? "").toUpperCase() === "NEW").length,
    in_progress: leads.filter((l) => {
      const s = (l.STATUS_ID ?? "").toUpperCase();
      return (
        s !== "NEW" && !leadIsWon(l) && !leadIsLost(l)
      );
    }).length,
    won: leads.filter(leadIsWon).length,
    lost: leads.filter(leadIsLost).length,
  };
}

export type FunnelStageRow = {
  id: string;
  externalId: string;
  name: string;
  sort: number;
  color: string | null;
  isSuccess: boolean;
  isLost: boolean;
  count: number;
  pipelineId: string;
  pipelineName: string;
  /** Классификация для аналитики */
  analyticsType: "won" | "lost" | "progress" | "ignore";
};

export type FunnelSummary = {
  total: number;
  new: number;
  in_progress: number;
  won: number;
  lost: number;
};

/**
 * Воронка по сделкам Bitrix24: стадии из API + сделки за период.
 */
export async function getPipelineFunnel(
  start: Date,
  end: Date,
  _connectionId?: string | null,
  managerIds?: string[],
): Promise<{ stages: FunnelStageRow[]; summary: FunnelSummary }> {
  const url = await getWebhook();
  if (!url) {
    return {
      stages: [],
      summary: { total: 0, new: 0, in_progress: 0, won: 0, lost: 0 },
    };
  }

  const df = ymd(start);
  const dt = ymd(end);
  const [wonStageIds, stageConfigs, pipelines, deals] = await Promise.all([
    getOrSyncWonStageIds(url),
    getStageConfigs(),
    fetchPipelinesCached(url),
    fetchDealsCached(url, df, dt, managerIds),
  ]);

  if (!pipelines.length) {
    const legacy = await funnelCounts(start, end, _connectionId, managerIds);
    return {
      stages: [],
      summary: {
        total: deals.length,
        ...legacy,
      },
    };
  }

  const byStage = new Map<string, number>();
  for (const d of deals) {
    const k = (d.STAGE_ID ?? "__none__").toString();
    byStage.set(k, (byStage.get(k) ?? 0) + 1);
  }

  const cfgByExt = new Map(stageConfigs.map((c) => [c.externalId, c]));

  function resolveAnalyticsType(
    externalId: string,
    stageName: string,
  ): "won" | "lost" | "progress" | "ignore" {
    const row = cfgByExt.get(externalId);
    if (row) {
      const t = row.type;
      if (t === "won" || t === "lost" || t === "progress" || t === "ignore") {
        return t;
      }
    }
    return autoDetectStageType(stageName);
  }

  const rows: FunnelStageRow[] = [];
  for (const p of pipelines) {
    p.stages.forEach((s, i) => {
      const analyticsType = resolveAnalyticsType(s.statusId, s.name);
      const sem = (s.semantics ?? "").toUpperCase();
      rows.push({
        id: `${p.id}-${s.statusId}`,
        externalId: s.statusId,
        name: s.name,
        sort: s.sort ?? i,
        color: cfgByExt.get(s.statusId)?.color ?? null,
        isSuccess: sem === "S" || analyticsType === "won",
        isLost: sem === "F" || analyticsType === "lost",
        count: byStage.get(s.statusId) ?? 0,
        pipelineId: p.id,
        pipelineName: p.name,
        analyticsType,
      });
    });
  }

  rows.sort((a, b) => {
    if (a.pipelineId !== b.pipelineId) {
      const pa = pipelines.find((x) => x.id === a.pipelineId)?.sort ?? 0;
      const pb = pipelines.find((x) => x.id === b.pipelineId)?.sort ?? 0;
      if (pa !== pb) return pa - pb;
    }
    return a.sort - b.sort;
  });

  let won = 0;
  let lost = 0;
  let inP = 0;
  for (const d of deals) {
    const t = dealAnalyticsType(d, stageConfigs, wonStageIds);
    if (t === "won") won += 1;
    else if (t === "lost") lost += 1;
    else if (t === "progress") inP += 1;
  }

  return {
    stages: rows,
    summary: {
      total: deals.length,
      new:
        rows.find((r) => r.externalId.toUpperCase().includes("NEW"))?.count ?? 0,
      in_progress: inP,
      won,
      lost,
    },
  };
}

export async function leadsByDay(
  start: Date,
  end: Date,
  _connectionId?: string | null,
  managerIds?: string[],
) {
  const url = await getWebhook();
  if (!url) return [];
  const df = ymd(start);
  const dt = ymd(end);
  const leads = await fetchLeadsCached(url, df, dt, managerIds);
  const byDay = new Map<string, number>();
  for (const l of leads) {
    const raw = l.DATE_CREATE ?? l.CREATED_TIME ?? "";
    const k = String(raw).slice(0, 10) || "—";
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  return Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));
}

export async function topFailReasons(
  start: Date,
  end: Date,
  _connectionId?: string | null,
  managerIds?: string[],
  take = 10,
) {
  const url = await getWebhook();
  if (!url) return [];

  await ensureBitrixLeadDictionaries(url);

  const df = ymd(start);
  const dt = ymd(end);
  const [leads, reasons] = await Promise.all([
    fetchLeadsCached(url, df, dt, managerIds),
    fetchLostReasonsCached(url),
  ]);

  const { lostMap: nameById } = await mergeBitrixDictionaryMaps(
    new Map(reasons.map((r) => [r.id, r.name])),
    new Map<string, string>(),
  );

  const map = new Map<string, number>();
  for (const l of leads) {
    if (!leadIsLost(l)) continue;
    const raw = (l.LOST_REASON_ID ?? "").toString().trim();
    const rid = raw || "unknown";
    map.set(rid, (map.get(rid) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([reasonId, count]) => {
      const label =
        reasonId === "unknown"
          ? "Не указана"
          : (nameById.get(reasonId) ?? `Причина ${reasonId}`);
      return { reason: label, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, take);
}
