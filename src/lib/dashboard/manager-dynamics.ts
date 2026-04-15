import {
  dealAnalyticsType,
  dealIsWon,
  getStageConfigs,
  parseOpportunity,
  type BitrixDeal,
  type BitrixLead,
} from "@/lib/bitrix/api";
import { fetchDealsUncached, fetchLeadsUncached } from "@/lib/bitrix/cache";
import { getOrSyncWonStageIds } from "@/lib/bitrix/won-stages";
import { periodKeyFromDate } from "@/lib/plan/period";
import { prisma } from "@/lib/prisma";
import type { StageConfig } from "@prisma/client";

export type GroupBy = "day" | "week" | "month";

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseEntityDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const day = raw.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return new Date(`${day}T12:00:00`);
  }
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t);
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  const dow = x.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function bucketKeyForDate(d: Date, groupBy: GroupBy): string {
  if (groupBy === "day") return toYMD(d);
  if (groupBy === "month") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return toYMD(startOfWeekMonday(d));
}

function formatBucketLabel(key: string, groupBy: GroupBy): string {
  if (groupBy === "day") {
    const [y, m, day] = key.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
    });
  }
  if (groupBy === "month") {
    const [y, mo] = key.split("-").map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString("ru-RU", {
      month: "long",
      year: "numeric",
    });
  }
  const [y, m, day] = key.split("-").map(Number);
  return `нед. ${new Date(y, m - 1, day).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  })}`;
}

type Agg = { leads: number; deals: number; wonSales: number };

function emptyAgg(): Agg {
  return { leads: 0, deals: 0, wonSales: 0 };
}

function ensureNested(
  root: Map<string, Map<string, Agg>>,
  bucket: string,
  mgr: string,
): Agg {
  if (!root.has(bucket)) root.set(bucket, new Map());
  const m = root.get(bucket)!;
  if (!m.has(mgr)) m.set(mgr, emptyAgg());
  return m.get(mgr)!;
}

function aggregate(
  leads: BitrixLead[],
  deals: BitrixDeal[],
  wonStageIds: string[],
  groupBy: GroupBy,
  managerFilter: Set<string> | null,
  stageConfigs?: StageConfig[],
): Map<string, Map<string, Agg>> {
  const root = new Map<string, Map<string, Agg>>();

  for (const l of leads) {
    const ext = (l.ASSIGNED_BY_ID ?? "").toString();
    if (!ext) continue;
    if (managerFilter && !managerFilter.has(ext)) continue;
    const d = parseEntityDate(l.DATE_CREATE ?? l.CREATED_TIME);
    if (!d) continue;
    const bk = bucketKeyForDate(d, groupBy);
    const a = ensureNested(root, bk, ext);
    a.leads += 1;
  }

  for (const deal of deals) {
    const ext = (deal.ASSIGNED_BY_ID ?? "").toString();
    if (!ext) continue;
    if (managerFilter && !managerFilter.has(ext)) continue;
    const d = parseEntityDate(deal.DATE_CREATE);
    if (!d) continue;
    const bk = bucketKeyForDate(d, groupBy);
    const a = ensureNested(root, bk, ext);
    a.deals += 1;
    const isWon =
      stageConfigs && stageConfigs.length > 0
        ? dealAnalyticsType(deal, stageConfigs, wonStageIds) === "won"
        : dealIsWon(deal, wonStageIds);
    if (isWon) {
      a.wonSales += parseOpportunity(deal.OPPORTUNITY);
    }
  }

  return root;
}

function totalsFromRoot(
  root: Map<string, Map<string, Agg>>,
): Map<string, Agg> {
  const out = new Map<string, Agg>();
  for (const [, byMgr] of Array.from(root.entries())) {
    for (const [ext, a] of Array.from(byMgr.entries())) {
      const cur = out.get(ext) ?? emptyAgg();
      cur.leads += a.leads;
      cur.deals += a.deals;
      cur.wonSales += a.wonSales;
      out.set(ext, cur);
    }
  }
  return out;
}

function conversionPct(leads: number, deals: number): number {
  if (leads <= 0) return 0;
  return Math.min(100, Math.round((deals / leads) * 100));
}

export type ManagerDynamicsResult = {
  groupBy: GroupBy;
  dateFrom: string;
  dateTo: string;
  managers: { externalId: string; name: string }[];
  buckets: {
    key: string;
    label: string;
    byManager: Record<
      string,
      { leads: number; deals: number; salesAmount: number; conversion: number }
    >;
  }[];
  lineChart: Record<string, string | number>[];
  table: {
    externalId: string;
    name: string;
    leads: number;
    deals: number;
    salesAmount: number;
    conversion: number;
    trendPct: number | null;
    planTarget: number | null;
    planMet: boolean;
  }[];
  barChart: {
    externalId: string;
    name: string;
    amount: number;
    planMet: boolean;
    planTarget: number | null;
  }[];
};

function prevPeriodYmd(
  dateFrom: string,
  dateTo: string,
): { prevFrom: string; prevTo: string } {
  const start = new Date(`${dateFrom}T00:00:00`);
  const end = new Date(`${dateTo}T23:59:59`);
  const ms = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - ms);
  return {
    prevFrom: toYMD(prevStart),
    prevTo: toYMD(prevEnd),
  };
}

export async function computeManagerDynamics(
  webhookUrl: string,
  dateFrom: string,
  dateTo: string,
  groupBy: GroupBy,
  managerIds?: string[],
  pipelineId?: string,
  stageIds?: string[],
): Promise<ManagerDynamicsResult> {
  const filter =
    managerIds?.length ? new Set(managerIds.map(String)) : null;
  const mids = managerIds?.length ? managerIds : undefined;

  const [wonStageIds, stageConfigs, leads, deals, prevRange, prismaManagers, planRows] =
    await Promise.all([
      getOrSyncWonStageIds(webhookUrl),
      getStageConfigs(),
      fetchLeadsUncached(webhookUrl, dateFrom, dateTo, mids),
      fetchDealsUncached(webhookUrl, dateFrom, dateTo, mids, pipelineId),
      Promise.resolve(prevPeriodYmd(dateFrom, dateTo)),
      prisma.manager.findMany({
        where: { crmType: "bitrix24" },
        select: { id: true, externalId: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.planTarget.findMany({
        where: {
          period: periodKeyFromDate(new Date(`${dateTo}T12:00:00`), "month"),
          periodType: "month",
        },
        select: { managerId: true, target: true },
      }),
    ]);

  const { prevFrom, prevTo } = prevRange;
  const [prevLeads, prevDeals] = await Promise.all([
    fetchLeadsUncached(webhookUrl, prevFrom, prevTo, mids),
    fetchDealsUncached(webhookUrl, prevFrom, prevTo, mids, pipelineId),
  ]);
  const stageFilter = stageIds?.length ? new Set(stageIds.map(String)) : null;
  const dealsScoped = stageFilter
    ? deals.filter((d) => stageFilter.has(String(d.STAGE_ID ?? "")))
    : deals;
  const prevDealsScoped = stageFilter
    ? prevDeals.filter((d) => stageFilter.has(String(d.STAGE_ID ?? "")))
    : prevDeals;

  const extToName = new Map(prismaManagers.map((m) => [m.externalId, m.name]));
  const extToPrismaId = new Map(
    prismaManagers.map((m) => [m.externalId, m.id]),
  );
  const planByManagerId = new Map(
    planRows.filter((r) => r.managerId).map((r) => [r.managerId!, r.target]),
  );

  const currentRoot = aggregate(
    leads,
    dealsScoped,
    wonStageIds,
    groupBy,
    filter,
    stageConfigs,
  );
  const prevTotals = totalsFromRoot(
    aggregate(prevLeads, prevDealsScoped, wonStageIds, "day", filter, stageConfigs),
  );
  const totals = totalsFromRoot(currentRoot);

  const extSet = new Set<string>(totals.keys());
  if (filter) {
    for (const id of Array.from(filter)) extSet.add(id);
  }

  const managersList: { externalId: string; name: string }[] = [];
  const seenMgr = new Set<string>();
  for (const m of prismaManagers) {
    if (filter && !filter.has(m.externalId)) continue;
    if (!extSet.has(m.externalId)) continue;
    managersList.push({ externalId: m.externalId, name: m.name });
    seenMgr.add(m.externalId);
  }
  for (const ext of Array.from(extSet)) {
    if (seenMgr.has(ext)) continue;
    managersList.push({ externalId: ext, name: extToName.get(ext) ?? ext });
  }
  managersList.sort((a, b) => a.name.localeCompare(b.name, "ru"));

  const bucketKeys = Array.from(currentRoot.keys()).sort();
  const buckets: ManagerDynamicsResult["buckets"] = [];

  for (const key of bucketKeys) {
    const byMgr = currentRoot.get(key)!;
    const rec: Record<
      string,
      { leads: number; deals: number; salesAmount: number; conversion: number }
    > = {};
    for (const [ext, a] of Array.from(byMgr.entries())) {
      rec[ext] = {
        leads: a.leads,
        deals: a.deals,
        salesAmount: a.wonSales,
        conversion: conversionPct(a.leads, a.deals),
      };
    }
    buckets.push({
      key,
      label: formatBucketLabel(key, groupBy),
      byManager: rec,
    });
  }

  const lineChart: Record<string, string | number>[] = buckets.map((b) => {
    const row: Record<string, string | number> = {
      label: b.label,
      bucket: b.key,
    };
    for (const m of managersList) {
      row[`sales_${m.externalId}`] = b.byManager[m.externalId]?.salesAmount ?? 0;
    }
    return row;
  });

  const table: ManagerDynamicsResult["table"] = [];
  for (const m of managersList) {
    const ext = m.externalId;
    const t = totals.get(ext) ?? emptyAgg();
    const prev = prevTotals.get(ext) ?? emptyAgg();
    const trendPct =
      prev.wonSales > 0
        ? Math.round(((t.wonSales - prev.wonSales) / prev.wonSales) * 100)
        : t.wonSales > 0
          ? 100
          : null;
    const prismaId = extToPrismaId.get(ext);
    const planTarget =
      prismaId != null ? planByManagerId.get(prismaId) ?? null : null;
    const planMet =
      planTarget != null && planTarget > 0 ? t.wonSales >= planTarget : false;
    table.push({
      externalId: ext,
      name: m.name,
      leads: t.leads,
      deals: t.deals,
      salesAmount: t.wonSales,
      conversion: conversionPct(t.leads, t.deals),
      trendPct,
      planTarget,
      planMet,
    });
  }

  table.sort((a, b) => b.salesAmount - a.salesAmount);

  const barChart = table.map((r) => ({
    externalId: r.externalId,
    name: r.name,
    amount: r.salesAmount,
    planMet: r.planMet,
    planTarget: r.planTarget,
  }));

  return {
    groupBy,
    dateFrom,
    dateTo,
    managers: managersList,
    buckets,
    lineChart,
    table,
    barChart,
  };
}
