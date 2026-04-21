import { jsonError, jsonOk } from "@/lib/http/json";
import { resolveOrgId } from "@/lib/org/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/google/connections
 * Список Google-подключений текущей организации. Нужен UI «Рекламные
 * кабинеты» чтобы выбрать googleConnectionId при линковке Google Ads.
 */
export async function GET() {
  try {
    const orgId = await resolveOrgId();
    const rows = await prisma.googleConnection.findMany({
      where: { orgId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        adsEnabled: true,
        sheetsEnabled: true,
        analyticsEnabled: true,
        adsCustomerId: true,
        createdAt: true,
      },
    });
    return jsonOk({ connections: rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
