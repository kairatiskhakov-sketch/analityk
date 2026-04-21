import { jsonError, jsonOk } from "@/lib/http/json";
import { getGoogleAccessToken } from "@/lib/integrations/google/connection";
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
    const conn = await prisma.googleConnection.findUnique({
      where: { id: body.connectionId },
      select: { orgId: true },
    });
    if (!conn || conn.orgId !== orgId) {
      return jsonError("Подключение не найдено", 404);
    }
    await getGoogleAccessToken(body.connectionId);
    return jsonOk({ refreshed: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
