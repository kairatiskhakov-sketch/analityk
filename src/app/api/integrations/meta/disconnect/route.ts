import { jsonError, jsonOk } from "@/lib/http/json";
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
    const conn = await prisma.adConnection.findUnique({
      where: { id: body.connectionId },
      select: { orgId: true, platform: true },
    });
    if (!conn || conn.orgId !== orgId || conn.platform !== "META") {
      return jsonError("Подключение не найдено", 404);
    }
    const updated = await prisma.adConnection.update({
      where: { id: body.connectionId },
      data: { status: "DISCONNECTED" },
    });
    return jsonOk({ connection: { id: updated.id, status: updated.status } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
