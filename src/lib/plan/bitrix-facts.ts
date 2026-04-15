import {
  dealAnalyticsType,
  dealIsWon,
  getStageConfigs,
  parseOpportunity,
  PLAN_FACT_DEAL_SELECT,
  type BitrixDeal,
} from "@/lib/bitrix/api";
import type { StageConfig } from "@prisma/client";
import { fetchDealsMergedByChunks } from "@/lib/plan/plan-bitrix-deals";
import { getOrSyncWonStageIds } from "@/lib/bitrix/won-stages";
import {
  daysInRangeInclusive,
  elapsedDaysInPeriod,
  getPeriodRange,
  parsePeriodToRange,
  type PlanPeriodType,
  ymdLocal,
} from "@/lib/plan/period";
import { prisma } from "@/lib/prisma";

export type FactRow = { managerId: string | null; fact: number };

/** Нормализация ФИО для сопоставления с каталогом user.get Bitrix24. */
export function normalizeManagerNameForMatch(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Варианты ключа externalId для lookup в byManager (ASSIGNED_BY_ID из сделок). */
function externalIdLookupKeys(externalId: string): string[] {
  const s = String(externalId ?? "").trim();
  const out = new Set<string>();
  if (s) {
    out.add(s);
    if (/^\d+(\.0+)?$/.test(s)) {
      const n = Number(s);
      if (Number.isFinite(n)) out.add(String(Math.trunc(n)));
    }
  }
  return Array.from(out);
}

export type ResolvePlanManagerFactResult = {
  fact: number;
  source: "externalId" | "name" | "none";
  /** Bitrix user id из каталога user.get при source === "name" */
  matchedBitrixId?: string;
};

/**
 * Факт по строке менеджера из БД: сначала по externalId (должен = Bitrix USER ID),
 * иначе по имени с каталогом активных пользователей Bitrix (если в БД устарел/неверный externalId).
 */
export function resolveFactForPlanManager(
  mgr: { externalId: string; name: string },
  byManager: Record<string, number>,
  bitrixUsers: { id: string; name: string }[],
): ResolvePlanManagerFactResult {
  for (const key of externalIdLookupKeys(mgr.externalId)) {
    if (Object.prototype.hasOwnProperty.call(byManager, key)) {
      return { fact: byManager[key], source: "externalId" };
    }
  }
  const nameToBitrixId = new Map<string, string>();
  for (const u of bitrixUsers) {
    const k = normalizeManagerNameForMatch(u.name);
    if (!nameToBitrixId.has(k)) nameToBitrixId.set(k, u.id);
  }
  const bid = nameToBitrixId.get(normalizeManagerNameForMatch(mgr.name));
  if (bid != null) {
    return {
      fact: byManager[bid] ?? 0,
      source: "name",
      matchedBitrixId: bid,
    };
  }
  return { fact: 0, source: "none" };
}

function dealYmd(d: BitrixDeal): string {
  const raw = (d.DATE_CREATE ?? "").toString();
  const day = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  try {
    return ymdLocal(new Date(raw));
  } catch {
    return day;
  }
}

/**
 * Агрегация выигранных сделок по менеджерам (ASSIGNED_BY_ID — строка).
 */
export function aggregateWonDealsFacts(
  deals: BitrixDeal[],
  wonStageIds: string[],
  stageConfigs?: StageConfig[],
  stageIds?: string[],
): {
  totalFact: number;
  byManager: Record<string, number>;
  dealsByManager: Record<string, number>;
} {
  const useSelectedStages = Boolean(stageIds && stageIds.length > 0);
  const selected = new Set((stageIds ?? []).map((s) => String(s)));
  const wonDeals = deals.filter((d) => {
    if (useSelectedStages) {
      return selected.has(String(d.STAGE_ID ?? ""));
    }
    return stageConfigs && stageConfigs.length > 0
      ? dealAnalyticsType(d, stageConfigs, wonStageIds) === "won"
      : dealIsWon(d, wonStageIds);
  });

  console.log("Plan facts - total deals:", deals.length);
  console.log("Plan facts - won stage ids:", wonStageIds);
  console.log("Plan facts - won deals:", wonDeals.length);
  console.log(
    "Plan facts - won deals stages:",
    wonDeals.map((d) => ({
      stage: d.STAGE_ID,
      amount: d.OPPORTUNITY,
    })),
  );

  const totalFact = wonDeals.reduce(
    (sum, d) => sum + parseOpportunity(d.OPPORTUNITY),
    0,
  );

  const byManager: Record<string, number> = {};
  const dealsByManager: Record<string, number> = {};
  for (const deal of wonDeals) {
    const mgrId = String(deal.ASSIGNED_BY_ID ?? "");
    if (!mgrId) continue;
    byManager[mgrId] =
      (byManager[mgrId] || 0) +
      parseFloat(String(deal.OPPORTUNITY ?? "0"));
    dealsByManager[mgrId] = (dealsByManager[mgrId] || 0) + 1;
  }

  console.log("byManager keys:", Object.keys(byManager));

  return { totalFact, byManager, dealsByManager };
}

/**
 * Факт за период: сделки подгружаются по неделям, дедуп по ID, затем won + суммы.
 */
export async function fetchPlanFactsUncached(
  webhookUrl: string,
  dateFrom: string,
  dateTo: string,
  stageIds?: string[],
  categoryId?: string,
): Promise<{
  totalFact: number;
  byManager: Record<string, number>;
  dealsByManager: Record<string, number>;
}> {
  const [wonStageIdsRaw, stageConfigs] = await Promise.all([
    getOrSyncWonStageIds(webhookUrl),
    getStageConfigs(),
  ]);
  const wonStageIds = Array.from(new Set(wonStageIdsRaw)).slice(0, 20);
  const stageFilterIds = stageIds?.length ? stageIds : wonStageIds;
  const allDeals = await fetchDealsMergedByChunks(
    webhookUrl,
    dateFrom,
    dateTo,
    PLAN_FACT_DEAL_SELECT,
    categoryId,
    stageFilterIds,
  );
  return aggregateWonDealsFacts(allDeals, wonStageIds, stageConfigs, stageIds);
}

/**
 * Факт продаж за интервал дат: Bitrix getDeals (чанками) + wonStageIds + dealIsWon.
 * byManager — ключ Bitrix ASSIGNED_BY_ID (строка).
 */
export async function getFactByManager(
  webhookUrl: string,
  dateFrom: string,
  dateTo: string,
): Promise<{
  totalFact: number;
  byManager: Record<string, number>;
  dealsByManager: Record<string, number>;
}> {
  return fetchPlanFactsUncached(webhookUrl, dateFrom, dateTo);
}

/** Сумма OPPORTUNITY по выигранным сделкам, группировка по Prisma Manager.id */
export async function computeWonDealFacts(
  webhookUrl: string,
  period: string,
  periodType: PlanPeriodType,
): Promise<{ team: number; byManagerId: Map<string, number> }> {
  const { dateFrom, dateTo } = getPeriodRange(period, periodType);
  const { totalFact, byManager } = await getFactByManager(
    webhookUrl,
    dateFrom,
    dateTo,
  );

  const managers = await prisma.manager.findMany({
    where: { crmType: "bitrix24" },
    select: { id: true, externalId: true },
  });
  const extToPrisma = new Map(
    managers.map((m) => [String(m.externalId), m.id]),
  );

  const byManagerId = new Map<string, number>();
  for (const [ext, amt] of Object.entries(byManager)) {
    const mid = extToPrisma.get(String(ext));
    if (!mid) continue;
    byManagerId.set(mid, (byManagerId.get(mid) ?? 0) + amt);
  }
  return { team: totalFact, byManagerId };
}

export function buildFactsPayload(team: number, byManagerId: Map<string, number>) {
  const facts: FactRow[] = [{ managerId: null, fact: team }];
  for (const [managerId, fact] of Array.from(byManagerId.entries())) {
    facts.push({ managerId, fact });
  }
  return facts;
}

export type ChartPoint = { date: string; fact: number; planLine: number };

export function buildPlanVsFactSeries(
  deals: BitrixDeal[],
  teamTarget: number,
  period: string,
  periodType: PlanPeriodType,
  wonStageIds?: string[],
  stageConfigs?: StageConfig[],
): ChartPoint[] {
  const { start, end } = parsePeriodToRange(period, periodType);
  const totalDays = Math.max(1, daysInRangeInclusive(start, end));
  const dailyPlan = teamTarget / totalDays;

  const won = deals.filter((d) =>
    stageConfigs && stageConfigs.length > 0
      ? dealAnalyticsType(d, stageConfigs, wonStageIds) === "won"
      : dealIsWon(d, wonStageIds),
  );
  const byDay = new Map<string, number>();
  for (const d of won) {
    const day = dealYmd(d);
    byDay.set(day, (byDay.get(day) ?? 0) + parseOpportunity(d.OPPORTUNITY));
  }

  const points: ChartPoint[] = [];
  let cum = 0;
  const cur = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  let i = 0;
  while (cur <= endDay) {
    const key = ymdLocal(cur);
    cum += byDay.get(key) ?? 0;
    i += 1;
    points.push({
      date: key,
      fact: cum,
      planLine: dailyPlan * i,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return points;
}

export function forecastTeam(
  teamFact: number,
  teamTarget: number,
  period: string,
  periodType: PlanPeriodType,
  now: Date = new Date(),
): {
  totalDays: number;
  daysPassed: number;
  pacePerDay: number;
  forecastEnd: number;
  message: "done" | "on_track" | "behind";
  neededPerDay?: number;
} {
  const { start, end } = parsePeriodToRange(period, periodType);
  const totalDays = Math.max(1, daysInRangeInclusive(start, end));
  const daysPassed = Math.max(1, elapsedDaysInPeriod(start, end, now));
  const pacePerDay = teamFact / daysPassed;
  const forecastEnd = pacePerDay * totalDays;

  if (teamTarget <= 0) {
    return {
      totalDays,
      daysPassed,
      pacePerDay: 0,
      forecastEnd: 0,
      message: "on_track",
    };
  }
  if (teamFact >= teamTarget) {
    return {
      totalDays,
      daysPassed,
      pacePerDay,
      forecastEnd,
      message: "done",
    };
  }
  const remaining = teamTarget - teamFact;
  const daysLeft = Math.max(0, totalDays - daysPassed);
  const neededPerDay = daysLeft > 0 ? remaining / daysLeft : remaining;

  if (forecastEnd >= teamTarget) {
    return {
      totalDays,
      daysPassed,
      pacePerDay,
      forecastEnd,
      message: "on_track",
    };
  }
  return {
    totalDays,
    daysPassed,
    pacePerDay,
    forecastEnd,
    message: "behind",
    neededPerDay,
  };
}
