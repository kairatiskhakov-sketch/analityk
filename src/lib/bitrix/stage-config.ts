import type { BitrixDeal } from "@/lib/bitrix/api";
import { dealIsLost, dealIsWon } from "@/lib/bitrix/deal-predicates";
import type { StageConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_ORG_ID, resolveOrgId } from "@/lib/org/context";

export type StageAnalyticsType = "won" | "lost" | "progress" | "ignore";

/** Автоклассификация по названию стадии, если в БД нет записи */
export function autoDetectStageType(stageName: string): StageAnalyticsType {
  const name = stageName.toLowerCase();
  if (
    name.includes("оплач") ||
    name.includes("выполнен") ||
    name.includes("сдан") ||
    name.includes("полная оплата") ||
    name.includes("успешн") ||
    name.includes("реализ") ||
    name.includes("won") ||
    name.includes("paid")
  ) {
    return "won";
  }
  if (
    name.includes("закрыт") ||
    name.includes("отказ") ||
    name.includes("провал") ||
    name.includes("не реализ") ||
    name.includes("junk") ||
    name.includes("lose")
  ) {
    return "lost";
  }
  return "progress";
}

export async function getStageConfigs(orgId?: string): Promise<StageConfig[]> {
  const effective = orgId ?? (await resolveOrgId()) ?? DEFAULT_ORG_ID;
  return prisma.stageConfig.findMany({
    where: { orgId: effective, crmType: "bitrix24" },
  });
}

export async function countStageConfigs(orgId?: string): Promise<number> {
  const effective = orgId ?? (await resolveOrgId()) ?? DEFAULT_ORG_ID;
  return prisma.stageConfig.count({
    where: { orgId: effective, crmType: "bitrix24" },
  });
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
