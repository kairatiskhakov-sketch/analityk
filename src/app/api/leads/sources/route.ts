import { fetchLeadsCached } from "@/lib/bitrix/cache";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { jsonError, jsonOk } from "@/lib/http/json";
import { parseDashboardFilters } from "@/lib/dashboard/dashboard-query";
import { leadIsLost, leadIsWon } from "@/lib/bitrix/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filters = parseDashboardFilters(searchParams);

    const conn = await getActiveBitrixConnection();
    const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
    if (!url) {
      return jsonOk({ sources: [] });
    }

    const leads = await fetchLeadsCached(
      url,
      ymd(filters.start),
      ymd(filters.end),
      filters.managerIds,
    );
    const rows = await prisma.crmDictionary.findMany({
      where: { crmType: "bitrix24", entityId: "SOURCE" },
    });
    const sourceMap = new Map(rows.map((r) => [r.externalId, r.name]));

    const grouped = new Map<string, { total: number; won: number; lost: number }>();
    for (const l of leads) {
      if (filters.pipelineId && String((l as { CATEGORY_ID?: string }).CATEGORY_ID ?? "") !== filters.pipelineId) continue;
      const raw = String(l.SOURCE_ID ?? "").trim();
      if (!raw) continue;
      const source = sourceMap.get(raw) ?? raw;
      const cur = grouped.get(source) ?? { total: 0, won: 0, lost: 0 };
      cur.total += 1;
      if (leadIsWon(l)) cur.won += 1;
      if (leadIsLost(l)) cur.lost += 1;
      grouped.set(source, cur);
    }

    const sources = Array.from(grouped.entries())
      .map(([source, v]) => ({
        source,
        count: v.total,
        won: v.won,
        lost: v.lost,
        conv: v.total > 0 ? Math.round((v.won / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
    return jsonOk({ sources });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
