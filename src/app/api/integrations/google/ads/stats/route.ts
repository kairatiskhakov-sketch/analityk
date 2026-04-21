import { decrypt } from "@/lib/crypto";
import { jsonError, jsonOk } from "@/lib/http/json";
import {
  fetchGoogleAdsAdGroupStats,
  microsToCurrency,
} from "@/lib/integrations/google/ads";
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
    if (!connection.adsEnabled || !connection.adsCustomerId) {
      return jsonError("Модуль Ads выключен или не задан customer id", 400);
    }

    const devToken =
      (connection.adsDeveloperToken
        ? decrypt(connection.adsDeveloperToken)
        : null) ?? process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    if (!devToken) {
      return jsonError("Нет developer token", 400);
    }

    const { from, to } = parsePeriodToDateRange(period);
    const mcc = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? null;

    const raw = await fetchGoogleAdsAdGroupStats(
      connection.adsCustomerId,
      accessToken,
      devToken,
      from,
      to,
      mcc,
    );

    const rows = (raw.results ?? []).map((r) => ({
      campaign: r.campaign?.name,
      adGroup: (r as { adGroup?: { name?: string } }).adGroup?.name,
      clicks: r.metrics?.clicks,
      impressions: r.metrics?.impressions,
      cost: microsToCurrency(r.metrics?.costMicros),
      conversions: r.metrics?.conversions,
      costPerConversion: (r.metrics as { costPerConversion?: string } | undefined)
        ?.costPerConversion,
    }));

    return jsonOk({ period: { from, to }, stats: rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка Google Ads";
    return jsonError(msg, 500);
  }
}
