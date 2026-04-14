/** Минимальный тип для проверки стадии сделки (без циклического импорта api.ts) */
export type DealStageFields = {
  STAGE_ID?: string;
  STAGE_NAME?: string;
  STAGE_SEMANTIC_ID?: string;
};

/** Выигранная сделка: список стадий из кеша или fallback по названию стадии */
export function dealIsWon(
  deal: DealStageFields,
  wonStageIds?: string[],
): boolean {
  const stage = deal.STAGE_ID ?? "";
  const stageName = deal.STAGE_NAME ?? "";

  if (wonStageIds && wonStageIds.length > 0) {
    return wonStageIds.includes(stage);
  }

  const wonKeywords = [
    "оплачен",
    "выполнен",
    "сдан",
    "полная оплата",
    "оплата получена",
    "won",
    "paid",
    "completed",
    "success",
  ];
  const stageNameLower = stageName.toLowerCase();
  return wonKeywords.some((kw) => stageNameLower.includes(kw));
}

export function dealIsLost(d: DealStageFields): boolean {
  const sem = (d.STAGE_SEMANTIC_ID ?? "").toUpperCase();
  if (sem === "F") return true;
  const sid = (d.STAGE_ID ?? "").toUpperCase();
  return /:LOSE$|_LOSE$|LOST$|JUNK$/i.test(sid);
}

export function dealInProgressByStageName(d: DealStageFields): boolean {
  const stageName = (d.STAGE_NAME ?? "").toLowerCase();
  const progressKeywords = [
    "в работе",
    "в ожидании",
    "ожидани",
    "проект",
    "интеграц",
  ];
  return progressKeywords.some((kw) => stageName.includes(kw));
}

export function dealIsProgress(
  d: DealStageFields,
  wonStageIds?: string[],
): boolean {
  return !dealIsWon(d, wonStageIds) && !dealIsLost(d);
}
