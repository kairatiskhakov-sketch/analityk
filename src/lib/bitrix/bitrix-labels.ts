/** Стандартные коды источника лида в Bitrix24 (если нет в crm.status.list SOURCE). */
export const BITRIX_DEFAULT_SOURCES: Record<string, string> = {
  CALL: "Звонок",
  EMAIL: "Email",
  WEB: "Веб-сайт",
  ADVERTISING: "Реклама",
  PARTNER: "Партнёр",
  RECOMMENDATION: "Рекомендация",
  TRADE_SHOW: "Выставка",
  SELF: "Собственный",
  OTHER: "Другое",
};

export function resolveBitrixSourceLabel(
  rawId: string | undefined,
  nameById: Map<string, string>,
): string {
  const id = (rawId ?? "").toString().trim() || "OTHER";
  return (
    nameById.get(id) ??
    BITRIX_DEFAULT_SOURCES[id] ??
    (rawId ? String(rawId) : "Другое")
  );
}
