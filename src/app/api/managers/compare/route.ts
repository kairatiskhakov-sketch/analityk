import { parseOpportunity } from "@/lib/bitrix/api";
import { fetchManagersCached } from "@/lib/bitrix/cache";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { fetchNewSalesForPeriod } from "@/lib/bitrix/stage-history-sales";
import { jsonError, jsonOk } from "@/lib/http/json";

export const dynamic = "force-dynamic";

function toYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function previousRange(dateFrom: string, dateTo: string) {
  const start = new Date(`${dateFrom}T00:00:00`);
  const end = new Date(`${dateTo}T23:59:59`);
  const ms = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - ms);
  return { prevFrom: toYmd(prevStart), prevTo: toYmd(prevEnd) };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const pipelineId = searchParams.get("pipelineId")?.trim() || undefined;
    if (!dateFrom || !dateTo) return jsonError("Укажите dateFrom и dateTo", 400);

    const conn = await getActiveBitrixConnection();
    const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
    if (!url) return jsonOk({ rows: [] });

    const { prevFrom, prevTo } = previousRange(dateFrom, dateTo);
    const [salesCur, salesPrev, managers] = await Promise.all([
      fetchNewSalesForPeriod(url, dateFrom, dateTo),
      fetchNewSalesForPeriod(url, prevFrom, prevTo),
      fetchManagersCached(url),
    ]);
    const nameById = new Map(managers.map((m) => [m.id, m.name]));

    const sumWonByManager = (deals: { ASSIGNED_BY_ID?: string; OPPORTUNITY?: string }[]) => {
      const out = new Map<string, number>();
      for (const d of deals) {
        const id = String(d.ASSIGNED_BY_ID ?? "");
        if (!id) continue;
        out.set(id, (out.get(id) ?? 0) + parseOpportunity(d.OPPORTUNITY));
      }
      return out;
    };

    const cur = sumWonByManager(salesCur.wonDeals);
    const prev = sumWonByManager(salesPrev.wonDeals);
    const ids = new Set<string>([
      ...Array.from(cur.keys()),
      ...Array.from(prev.keys()),
    ]);
    const rows = Array.from(ids).map((id) => {
      const current = cur.get(id) ?? 0;
      const previous = prev.get(id) ?? 0;
      const change = previous > 0 ? Math.round(((current - previous) / previous) * 100) : (current > 0 ? 100 : 0);
      return {
        managerId: id,
        name: nameById.get(id) ?? id,
        current,
        previous,
        changePct: change,
      };
    }).sort((a, b) => b.current - a.current);

    return jsonOk({ rows });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Error", 500);
  }
}
