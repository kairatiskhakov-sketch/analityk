import { jsonError, jsonOk } from "@/lib/http/json";
import { syncGoogleAdsConnection } from "@/lib/integrations/google/ads-sync";
import { resolveOrgId } from "@/lib/org/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { connectionId?: string; windowDays?: number };
    if (!body.connectionId?.trim()) {
      return jsonError("Нужен connectionId");
    }
    const orgId = await resolveOrgId();
    const conn = await prisma.adConnection.findUnique({
      where: { id: body.connectionId },
      select: { orgId: true, platform: true },
    });
    if (!conn || conn.orgId !== orgId || conn.platform !== "GOOGLE") {
      return jsonError("Подключение не найдено", 404);
    }

    try {
      const result = await syncGoogleAdsConnection(body.connectionId, {
        windowDays: body.windowDays,
      });
      return jsonOk({ result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка синхронизации";
      await prisma.adConnection.update({
        where: { id: body.connectionId },
        data: { status: "ERROR", lastError: msg.slice(0, 500) },
      });
      return jsonError(msg, 500);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
