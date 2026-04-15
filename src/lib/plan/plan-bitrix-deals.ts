import { BitrixAPI, PLAN_FACT_DEAL_SELECT, type BitrixDeal } from "@/lib/bitrix/api";

function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return new Date(NaN);
  }
  return new Date(y, m - 1, d);
}

function formatYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Разбить [dateFrom, dateTo] на интервалы по ~7 дней (меньше трафика за запрос к Bitrix). */
export function splitIntoWeeks(
  dateFrom: string,
  dateTo: string,
): { from: string; to: string }[] {
  const chunks: { from: string; to: string }[] = [];
  let current = parseYmdLocal(dateFrom);
  const end = parseYmdLocal(dateTo);
  if (Number.isNaN(current.getTime()) || Number.isNaN(end.getTime())) {
    return [];
  }
  if (current > end) return chunks;
  while (current <= end) {
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (weekEnd > end) weekEnd.setTime(end.getTime());
    chunks.push({
      from: formatYmdLocal(current),
      to: formatYmdLocal(weekEnd),
    });
    current = new Date(weekEnd);
    current.setDate(current.getDate() + 1);
  }
  return chunks;
}

export async function fetchDealsMergedByChunks(
  webhookUrl: string,
  dateFrom: string,
  dateTo: string,
  select: readonly string[] = PLAN_FACT_DEAL_SELECT,
  categoryId?: string,
  stageIds?: string[],
): Promise<BitrixDeal[]> {
  const api = new BitrixAPI(webhookUrl);
  const chunks = splitIntoWeeks(dateFrom, dateTo);
  const byId = new Map<string, BitrixDeal>();
  for (const chunk of chunks) {
    const deals = await api.getDeals({
      dateFrom: chunk.from,
      dateTo: chunk.to,
      select: [...select],
      categoryId,
      stageIds,
    });
    for (const d of deals) {
      const id = d.ID != null ? String(d.ID) : "";
      if (id) byId.set(id, d);
    }
  }
  return Array.from(byId.values());
}
