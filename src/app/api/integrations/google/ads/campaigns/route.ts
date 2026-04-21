import { decrypt } from "@/lib/crypto";
import { jsonError, jsonOk } from "@/lib/http/json";
import { fetchGoogleAdsCampaigns, microsToCurrency } from "@/lib/integrations/google/ads";
import { getGoogleAccessToken } from "@/lib/integrations/google/connection";
import { resolveOrgId } from "@/lib/org/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const connectionId = searchParams.get("connectionId");
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
    if (!connection.adsEnabled || !connection.adsCustomerId) {
      return jsonError("Модуль Ads выключен или не задан customer id", 400);
    }

    const devToken =
      (connection.adsDeveloperToken
        ? decrypt(connection.adsDeveloperToken)
        : null) ?? process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    if (!devToken) {
      return jsonError("Задайте developer token в подключении или GOOGLE_ADS_DEVELOPER_TOKEN", 400);
    }

    const mcc = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? null;

    const raw = await fetchGoogleAdsCampaigns(
      connection.adsCustomerId,
      accessToken,
      devToken,
      mcc,
    );

    const rows = (raw.results ?? []).map((r) => ({
      campaignId: r.campaign?.id,
      name: r.campaign?.name,
      status: r.campaign?.status,
      impressions: r.metrics?.impressions,
      clicks: r.metrics?.clicks,
      cost: microsToCurrency(r.metrics?.costMicros),
      conversions: r.metrics?.conversions,
    }));

    return jsonOk({ campaigns: rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка Google Ads";
    return jsonError(msg, 500);
  }
}
