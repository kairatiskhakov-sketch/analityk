import { unstable_cache } from "next/cache";
import { fetchPlanFactsUncached } from "@/lib/plan/bitrix-facts";

/** Кеш факта плана/факта (10 мин) — снижает нагрузку на Bitrix при повторных открытиях. */
export async function getCachedPlanFactsAggregate(
  webhookUrl: string,
  dateFrom: string,
  dateTo: string,
): Promise<{ totalFact: number; byManager: Record<string, number> }> {
  const runner = unstable_cache(
    async () => fetchPlanFactsUncached(webhookUrl, dateFrom, dateTo),
    ["plan-facts", webhookUrl, dateFrom, dateTo],
    { revalidate: 600 },
  );
  return runner();
}
