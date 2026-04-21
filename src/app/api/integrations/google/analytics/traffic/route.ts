import { jsonError, jsonOk } from "@/lib/http/json";
import { runTrafficBySourceMedium } from "@/lib/integrations/google/analytics";
import { getGoogleAccessToken } from "@/lib/integrations/google/connection";
import { parsePeriodToDateRange } from "@/lib/integrations/google/period";
import { resolveOrgId } from "@/lib/org/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const connectionId = searchParams.get("connectionId");
    const period = searchParams.get("period");
    if (!connectionId) {
      return jsonError("Нужен connectionId");
    }

    const orgId = await resolveOrgId();
    const owner = await prisma.googleConnection.findUnique({
      where: { id: connectionId },
      select: { orgId: true },
    });
    if (!owner || owner.orgId !== orgId) {
      return jsonError("Подключение не найдено", 404);
    }

    const { accessToken, connection } = await getGoogleAccessToken(connectionId);
    if (!connection.analyticsEnabled || !connection.analyticsPropertyId) {
      return jsonError("Analytics выключен или нет property id", 400);
    }

    const { from, to } = parsePeriodToDateRange(period);
    const data = await runTrafficBySourceMedium(
      accessToken,
      connection.analyticsPropertyId,
      from,
      to,
    );

    return jsonOk({ report: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка GA4";
    return jsonError(msg, 500);
  }
}
