import {
  leadIsLost,
  leadIsWon,
} from "@/lib/bitrix/api";
import { fetchLeadsCached, fetchManagersCached } from "@/lib/bitrix/cache";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { parseManagerIdsFromSearchParams } from "@/lib/dashboard/dashboard-query";
import { parseDashboardRangeFromSearchParams } from "@/lib/dashboard/range";
import { jsonError, jsonOk } from "@/lib/http/json";

export const dynamic = "force-dynamic";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const { start, end } = parseDashboardRangeFromSearchParams(searchParams);
    const filterIds = parseManagerIdsFromSearchParams(searchParams);

    const conn = await getActiveBitrixConnection();
    const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
    if (!url) {
      return jsonOk({ ranking: [], error: null });
    }

    try {
      const [leads, managers] = await Promise.all([
        fetchLeadsCached(url, ymd(start), ymd(end), filterIds),
        fetchManagersCached(url),
      ]);
      const nameById = new Map(managers.map((m) => [m.id, m.name]));

      const byAssignee = new Map<
        string,
        { total: number; won: number; lost: number }
      >();
      for (const l of leads) {
        const id = (l.ASSIGNED_BY_ID ?? "").toString() || "__unassigned__";
        const cur = byAssignee.get(id) ?? { total: 0, won: 0, lost: 0 };
        cur.total += 1;
        if (leadIsWon(l)) cur.won += 1;
        if (leadIsLost(l)) cur.lost += 1;
        byAssignee.set(id, cur);
      }

      const ranking = Array.from(byAssignee.entries())
        .map(([id, v]) => ({
          managerId: id,
          name:
            id === "__unassigned__"
              ? "Не назначен"
              : nameById.get(id) ?? id,
          total: v.total,
          won: v.won,
          lost: v.lost,
          conversion: v.total > 0 ? Math.round((v.won / v.total) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.total - a.total);

      return jsonOk({ ranking, error: null });
    } catch {
      return jsonOk({ ranking: [], error: "CRM недоступна", data: null });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
