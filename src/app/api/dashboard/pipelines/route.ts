import { fetchPipelinesCached } from "@/lib/bitrix/cache";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const conn = await getActiveBitrixConnection();
    const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
    if (url) {
      try {
        const list = await fetchPipelinesCached(url);
        return jsonOk({
          pipelines: list.map((p) => ({
            id: p.id,
            externalId: p.id,
            name: p.name,
          })),
        });
      } catch {
        /* fallback */
      }
    }

    const active = conn;
    if (!active) {
      return jsonOk({ pipelines: [] });
    }
    const pipelines = await prisma.dealPipeline.findMany({
      where: { connectionId: active.id, crmType: "bitrix24" },
      orderBy: { sort: "asc" },
      select: { id: true, externalId: true, name: true },
    });
    return jsonOk({ pipelines });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
