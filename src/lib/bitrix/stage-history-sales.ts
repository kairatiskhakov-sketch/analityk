import { BitrixAPI, getStageConfigs, type BitrixDeal } from "@/lib/bitrix/api";
import { getOrSyncWonStageIds } from "@/lib/bitrix/won-stages";

/**
 * UF-поле «Дата оплаты» в Bitrix24.
 * Задаётся через env BITRIX_PAYMENT_DATE_FIELD для других порталов.
 */
export const BITRIX_PAYMENT_DATE_FIELD =
  process.env.BITRIX_PAYMENT_DATE_FIELD?.trim() || "UF_CRM_1762323120703";

/** Select-набор для продажных сделок. */
const SALES_SELECT = [
  "ID",
  "TITLE",
  "STAGE_ID",
  "CATEGORY_ID",
  "OPPORTUNITY",
  "ASSIGNED_BY_ID",
  "DATE_CREATE",
  "CLOSEDATE",
  "CLOSED",
  "STAGE_SEMANTIC_ID",
  "SOURCE_ID",
  "LOSS_REASON_ID",
  BITRIX_PAYMENT_DATE_FIELD,
] as const;

/**
 * Продажи за период: сделки в «продажных» стадиях, у которых
 * «Дата оплаты» (UF_CRM_1762323120703) попадает в [dateFrom, dateTo].
 *
 * Это самый точный подход:
 *  - Сделка создана в марте, оплата в апреле → считается апрелём ✓
 *  - Сделка в активной стадии без CLOSEDATE → считается если есть дата оплаты ✓
 *  - Не нужен stagehistory, не нужен DATE_MODIFY ✓
 */
export async function fetchNewSalesForPeriod(
  webhookUrl: string,
  dateFrom: string,
  dateTo: string,
): Promise<{
  wonDealIds: Set<string>;
  wonDeals: BitrixDeal[];
  wonStageIds: string[];
}> {
  const api = new BitrixAPI(webhookUrl);
  const [wonStageIdsRaw, stageConfigs] = await Promise.all([
    getOrSyncWonStageIds(webhookUrl),
    getStageConfigs(),
  ]);

  // Объединяем авто-won (semantic=S) + пользовательские StageConfig "won"
  const configWonIds = stageConfigs
    .filter((c) => c.type === "won")
    .map((c) => String(c.externalId));
  const allWonIds = Array.from(new Set([...wonStageIdsRaw, ...configWonIds]));

  if (allWonIds.length === 0) {
    return { wonDealIds: new Set(), wonDeals: [], wonStageIds: [] };
  }

  // Сделки в «продажных» стадиях с датой оплаты в периоде
  const wonDeals = await api.getDeals({
    dateFrom,
    dateTo,
    dateField: BITRIX_PAYMENT_DATE_FIELD,
    stageIds: allWonIds,
    select: [...SALES_SELECT],
  });

  const wonDealIds = new Set(
    wonDeals.map((d) => String(d.ID ?? "")).filter(Boolean),
  );

  return { wonDealIds, wonDeals, wonStageIds: allWonIds };
}
