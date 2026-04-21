import { jsonError, jsonOk } from "@/lib/http/json";
import { resolveOrgId } from "@/lib/org/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Body = { connectionId?: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.connectionId?.trim()) {
      return jsonError("Нужен connectionId");
    }

    const orgId = await resolveOrgId();
    const conn = await prisma.crmConnection.findUnique({
      where: { id: body.connectionId.trim() },
    });
    if (!conn || conn.crmType !== "bitrix24" || conn.orgId !== orgId) {
      return jsonError("Подключение Bitrix24 не найдено", 404);
    }

    await prisma.crmConnection.update({
      where: { id: conn.id },
      data: { isActive: false },
    });

    return jsonOk({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
