import {
  dealAnalyticsType,
  dealIsLost,
  dealIsWon,
  getStageConfigs,
  leadIsLost,
  leadIsWon,
  parseOpportunity,
} from "@/lib/bitrix/api";
import {
  fetchDealsCached,
  fetchLeadsCached,
  fetchManagersCached,
  fetchSourcesCatalogCached,
} from "@/lib/bitrix/cache";
import { mergeBitrixDictionaryMaps } from "@/lib/bitrix/crm-dictionary";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { getOrSyncWonStageIds } from "@/lib/bitrix/won-stages";
import type { LeadExportRow } from "@/lib/integrations/google/sheets";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function bitrixLeadExportRowsForDay(day: Date): Promise<LeadExportRow[]> {
  const conn = await getActiveBitrixConnection();
  if (!conn) return [];
  const url = getBitrixWebhookBaseUrl(conn);
  if (!url) return [];
  const df = ymd(day);
  const [leads, managers, sources] = await Promise.all([
    fetchLeadsCached(url, df, df),
    fetchManagersCached(url),
    fetchSourcesCatalogCached(url),
  ]);
  const mgrMap = new Map(managers.map((m) => [m.id, m.name]));
  const { srcMap } = await mergeBitrixDictionaryMaps(
    new Map<string, string>(),
    new Map(sources.map((s) => [s.id, s.name])),
  );
  return leads.map((l) => ({
    id: l.ID ?? "",
    name: (l.TITLE ?? "").trim() || "—",
    channel: srcMap.get((l.SOURCE_ID ?? "").toString()) ?? (l.SOURCE_ID ?? "—").toString(),
    manager: mgrMap.get((l.ASSIGNED_BY_ID ?? "").toString()) ?? "—",
    amount: parseOpportunity(l.OPPORTUNITY),
    status: (l.STATUS_ID ?? "").toString(),
    reason: (l.LOST_REASON_ID ?? "").toString(),
    date: df,
  }));
}

export type DailyBitrixReport = {
  date: string;
  leadsCount: number;
  soldCount: number;
  soldAmount: number;
  lostCount: number;
  inProgressCount: number;
  bestManager?: string;
};

export async function buildBitrixDailyReportData(): Promise<DailyBitrixReport> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  const conn = await getActiveBitrixConnection();
  const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
  if (!url) {
    return {
      date: start.toISOString().slice(0, 10),
      leadsCount: 0,
      soldCount: 0,
      soldAmount: 0,
      lostCount: 0,
      inProgressCount: 0,
    };
  }
  const df = ymd(start);
  const dt = ymd(end);
  const [wonStageIds, stageConfigs, leads, deals] = await Promise.all([
    getOrSyncWonStageIds(url),
    getStageConfigs(),
    fetchLeadsCached(url, df, dt),
    fetchDealsCached(url, df, dt),
  ]);
  const wonLeads = leads.filter(leadIsWon);
  const lostLeads = leads.filter(leadIsLost);
  const inProgress = leads.filter((l) => !leadIsWon(l) && !leadIsLost(l));
  const leadSales = wonLeads.reduce((s, l) => s + parseOpportunity(l.OPPORTUNITY), 0);
  const dealSales = deals
    .filter((d) =>
      stageConfigs.length > 0
        ? dealAnalyticsType(d, stageConfigs, wonStageIds) === "won"
        : dealIsWon(d, wonStageIds),
    )
    .reduce((s, d) => s + parseOpportunity(d.OPPORTUNITY), 0);
  const soldAmount = leadSales + dealSales;

  const byMgr = new Map<string, { name: string; wins: number }>();
  const managers = await fetchManagersCached(url);
  const nameById = new Map(managers.map((m) => [m.id, m.name]));
  for (const l of wonLeads) {
    const id = (l.ASSIGNED_BY_ID ?? "").toString();
    if (!id) continue;
    const name = nameById.get(id) ?? id;
    const cur = byMgr.get(id) ?? { name, wins: 0 };
    cur.wins += 1;
    byMgr.set(id, cur);
  }
  const best = Array.from(byMgr.values()).sort((a, b) => b.wins - a.wins)[0];

  return {
    date: start.toISOString().slice(0, 10),
    leadsCount: leads.length,
    soldCount: wonLeads.length,
    soldAmount,
    lostCount: lostLeads.length,
    inProgressCount: inProgress.length,
    bestManager: best?.name,
  };
}

export async function bitrixWonAmountForMonth(d: Date): Promise<number> {
  const conn = await getActiveBitrixConnection();
  const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
  if (!url) return 0;
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  const [wonStageIds, stageConfigs, deals] = await Promise.all([
    getOrSyncWonStageIds(url),
    getStageConfigs(),
    fetchDealsCached(url, ymd(start), ymd(end)),
  ]);
  return deals
    .filter((d) =>
      stageConfigs.length > 0
        ? dealAnalyticsType(d, stageConfigs, wonStageIds) === "won"
        : dealIsWon(d, wonStageIds),
    )
    .reduce((s, x) => s + parseOpportunity(x.OPPORTUNITY), 0);
}
