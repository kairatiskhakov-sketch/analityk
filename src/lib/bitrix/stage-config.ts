import type { BitrixDeal } from "@/lib/bitrix/api";
import { dealIsLost, dealIsWon } from "@/lib/bitrix/deal-predicates";
import type { StageConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type StageAnalyticsType = "won" | "lost" | "progress" | "ignore";

/** Автоклассификация по названию стадии, если в БД нет записи */
export function autoDetectStageType(stageName: string): StageAnalyticsType {
  const name = stageName.toLowerCase();
  if (
    name.includes("оплач") ||
    name.includes("выполнен") ||
    name.includes("сдан") ||
    name.includes("полная оплата")
  ) {
    return "won";
  }
  if (
    name.includes("закрыт") ||
    name.includes("отказ") ||
    name.includes("провал") ||
    name.includes("не реализ")
  ) {
    return "lost";
  }
  return "progress";
}

export async function getStageConfigs(): Promise<StageConfig[]> {
  return prisma.stageConfig.findMany({
    where: { crmType: "bitrix24" },
  });
}

export async function countStageConfigs(): Promise<number> {
  return prisma.stageConfig.count({ where: { crmType: "bitrix24" } });
}

/**
 * Тип сделки для аналитики: сначала StageConfig по STAGE_ID, иначе эвристика dealIsWon / dealIsLost.
 */
export function dealAnalyticsType(
  deal: BitrixDeal,
  configs: StageConfig[],
  wonStageIds?: string[],
): StageAnalyticsType {
  const sid = String(deal.STAGE_ID ?? "");
  const c = configs.find((x) => x.externalId === sid);
  if (c) {
    const t = c.type as StageAnalyticsType;
    if (t === "won" || t === "lost" || t === "progress" || t === "ignore") {
      return t;
    }
  }
  if (dealIsWon(deal, wonStageIds)) return "won";
  if (dealIsLost(deal)) return "lost";
  return "progress";
}

export function dealIsWonByConfig(
  deal: BitrixDeal,
  configs: StageConfig[],
  wonStageIds?: string[],
): boolean {
  return dealAnalyticsType(deal, configs, wonStageIds) === "won";
}

export function dealIsLostByConfig(
  deal: BitrixDeal,
  configs: StageConfig[],
  wonStageIds?: string[],
): boolean {
  return dealAnalyticsType(deal, configs, wonStageIds) === "lost";
}

export function dealIsProgressByConfig(
  deal: BitrixDeal,
  configs: StageConfig[],
  wonStageIds?: string[],
): boolean {
  return dealAnalyticsType(deal, configs, wonStageIds) === "progress";
}
