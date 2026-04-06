import { jsonError, jsonOk } from "@/lib/http/json";
import { runTrafficBySourceMedium } from "@/lib/integrations/google/analytics";
import { getGoogleAccessToken } from "@/lib/integrations/google/connection";
import { parsePeriodToDateRange } from "@/lib/integrations/google/period";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const connectionId = searchParams.get("connectionId");
    const period = searchParams.get("period");
    if (!connectionId) {
      return jsonError("Нужен connectionId");
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
