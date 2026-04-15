import { jsonError, jsonOk } from "@/lib/http/json";
import { parseDashboardFilters } from "@/lib/dashboard/dashboard-query";
import { fetchDealsCached } from "@/lib/bitrix/cache";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filters = parseDashboardFilters(searchParams);
    const conn = await getActiveBitrixConnection();
    const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
    if (!url) return jsonOk({ stages: [], summary: { total: 0 } });

    const [deals, stages] = await Promise.all([
      fetchDealsCached(
        url,
        filters.start.toISOString().slice(0, 10),
        filters.end.toISOString().slice(0, 10),
        filters.managerIds,
        filters.pipelineId,
      ),
      prisma.stageConfig.findMany({
        where: {
          crmType: "bitrix24",
          ...(filters.pipelineId ? { pipelineId: filters.pipelineId } : {}),
        },
        orderBy: [{ pipelineName: "asc" }, { name: "asc" }],
      }),
    ]);

    const counts = new Map<string, number>();
    for (const d of deals) {
      const sid = String(d.STAGE_ID ?? "");
      counts.set(sid, (counts.get(sid) ?? 0) + 1);
    }

    const rows = stages.map((s, idx) => {
      const count = counts.get(s.externalId) ?? 0;
      const prev = idx > 0 ? counts.get(stages[idx - 1].externalId) ?? 0 : count;
      const passPct = prev > 0 ? Math.round((count / prev) * 100) : 100;
      const dropPct = Math.max(0, 100 - passPct);
      return {
        id: s.externalId,
        name: s.name,
        type: s.type,
        count,
        passPct,
        dropPct,
      };
    });

    return jsonOk({
      stages: rows,
      summary: { total: rows[0]?.count ?? 0, byStages: rows.length },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
