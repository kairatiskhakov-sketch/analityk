import { jsonError, jsonOk } from "@/lib/http/json";
import { fetchAccessibleCustomers } from "@/lib/integrations/google/ads";
import { getGoogleAccessToken } from "@/lib/integrations/google/connection";
import { resolveOrgId } from "@/lib/org/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/google-ads/customers?googleConnectionId=<id>&developerToken=<optional>
 * Возвращает список customer_id, к которым у текущего Google OAuth-токена есть доступ.
 * Используется UI перед линковкой ad account в AdConnection.
 */
export async function GET(req: Request) {
  try {
    const orgId = await resolveOrgId();
    const { searchParams } = new URL(req.url);
    const googleConnectionId = searchParams.get("googleConnectionId")?.trim();
    const overrideDeveloperToken = searchParams.get("developerToken")?.trim() || null;
    if (!googleConnectionId) return jsonError("Нужен googleConnectionId");

    const gconn = await prisma.googleConnection.findUnique({
      where: { id: googleConnectionId },
      select: { id: true, orgId: true, adsDeveloperToken: true },
    });
    if (!gconn || (gconn.orgId && gconn.orgId !== orgId)) {
      return jsonError("Google подключение не найдено", 404);
    }
    const developerToken =
      overrideDeveloperToken || gconn.adsDeveloperToken?.trim() || "";
    if (!developerToken) {
      return jsonError("developer-token не задан (GoogleConnection.adsDeveloperToken или параметр)");
    }
    const { accessToken } = await getGoogleAccessToken(googleConnectionId);
    const customers = await fetchAccessibleCustomers(accessToken, developerToken);
    return jsonOk({ customers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
