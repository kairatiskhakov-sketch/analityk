import { jsonError, jsonOk } from "@/lib/http/json";
import { autoLoadStageConfigsByConnectionId } from "@/lib/bitrix/auto-stage-config";
import { syncBitrix24Connection } from "@/lib/integrations/bitrix24/sync";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { connectionId?: string };
    if (!body.connectionId?.trim()) {
      return jsonError("Нужен connectionId");
    }
    const result = await syncBitrix24Connection(body.connectionId);
    const loadedStages = await autoLoadStageConfigsByConnectionId(body.connectionId);
    return jsonOk({ result: { ...result, loadedStages } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка синхронизации";
    return jsonError(msg, 500);
  }
}
