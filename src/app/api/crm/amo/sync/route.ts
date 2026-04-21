import { jsonError, jsonOk } from "@/lib/http/json";
import { syncAmoConnection } from "@/lib/integrations/amocrm/sync";
import { resolveOrgId } from "@/lib/org/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { connectionId?: string };
    if (!body.connectionId?.trim()) {
      return jsonError("Нужен connectionId");
    }
    const orgId = await resolveOrgId();
    const conn = await prisma.crmConnection.findUnique({
      where: { id: body.connectionId },
      select: { orgId: true, crmType: true },
    });
    if (!conn || conn.crmType !== "amocrm" || conn.orgId !== orgId) {
      return jsonError("Подключение не найдено", 404);
    }
    const result = await syncAmoConnection(body.connectionId);
    return jsonOk({ result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка синхронизации";
    return jsonError(msg, 500);
  }
}
