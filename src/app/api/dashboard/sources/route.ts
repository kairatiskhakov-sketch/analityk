import { leadIsLost, leadIsWon } from "@/lib/bitrix/api";
import { resolveBitrixSourceLabel } from "@/lib/bitrix/bitrix-labels";
import {
  ensureBitrixLeadDictionaries,
  mergeBitrixDictionaryMaps,
} from "@/lib/bitrix/crm-dictionary";
import { fetchLeadsCached, fetchSourcesCatalogCached } from "@/lib/bitrix/cache";
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
    const managerIds = parseManagerIdsFromSearchParams(searchParams);

    const conn = await getActiveBitrixConnection();
    const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
    if (!url) {
      return jsonOk({ sources: [], error: null });
    }

    try {
      await ensureBitrixLeadDictionaries(url);

      const [leads, catalog] = await Promise.all([
        fetchLeadsCached(url, ymd(start), ymd(end), managerIds),
        fetchSourcesCatalogCached(url),
      ]);
      const { srcMap: nameById } = await mergeBitrixDictionaryMaps(
        new Map<string, string>(),
        new Map(catalog.map((s) => [s.id, s.name])),
      );

      console.log(
        "Sample SOURCE_IDs:",
        Array.from(new Set(leads.map((l) => l.SOURCE_ID))).slice(0, 10),
      );

      const grouped = new Map<
        string,
        { count: number; won: number; lost: number }
      >();

      for (const l of leads) {
        const sourceName = resolveBitrixSourceLabel(l.SOURCE_ID, nameById);
        const cur = grouped.get(sourceName) ?? { count: 0, won: 0, lost: 0 };
        cur.count += 1;
        if (leadIsWon(l)) cur.won += 1;
        if (leadIsLost(l)) cur.lost += 1;
        grouped.set(sourceName, cur);
      }

      const sources = Array.from(grouped.entries())
        .map(([source, data]) => ({
          source,
          count: data.count,
          won: data.won,
          lost: data.lost,
          conv:
            data.count > 0
              ? Math.round((data.won / data.count) * 100)
              : 0,
        }))
        .sort((a, b) => b.count - a.count);

      return jsonOk({ sources, error: null });
    } catch {
      return jsonOk({ sources: [], error: "CRM недоступна", data: null });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
