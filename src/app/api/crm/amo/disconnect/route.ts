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
    const existing = await prisma.crmConnection.findUnique({
      where: { id: body.connectionId },
      select: { orgId: true, crmType: true },
    });
    if (!existing || existing.crmType !== "amocrm" || existing.orgId !== orgId) {
      return jsonError("Подключение не найдено", 404);
    }

    const updated = await prisma.crmConnection.update({
      where: { id: body.connectionId },
      data: {
        isActive: false,
        amoAccessToken: null,
        amoRefreshToken: null,
        amoTokenExpiresAt: null,
      },
    });

    return jsonOk({ connection: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
