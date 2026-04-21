/**
 * Синхронизация Google Ads в унифицированную модель AdConnection/AdCampaign/AdInsightsDaily.
 *
 * В отличие от Meta/TikTok, OAuth-токены Google живут в `GoogleConnection`
 * (общий для Sheets + Analytics + Ads). Мы связываем `AdConnection` с
 * `GoogleConnection` через `extra.googleConnectionId` и рефрешим токен через
 * существующий `getGoogleAccessToken(connId)`.
 *
 * developer_token можно задать либо на уровне GoogleConnection.adsDeveloperToken,
 * либо переопределить в `AdConnection.extra.developerToken`.
 * `login-customer-id` (MCC) — в `AdConnection.extra.loginCustomerId`.
 */

import {
  fetchGoogleAdsCampaignsCatalog,
  fetchGoogleAdsDailyInsights,
  microsToCurrency,
} from "@/lib/integrations/google/ads";
import { getGoogleAccessToken } from "@/lib/integrations/google/connection";
import { prisma } from "@/lib/prisma";

export type GoogleAdsLinkExtra = {
  googleConnectionId: string;
  loginCustomerId?: string | null;
  developerToken?: string | null;
};

function parseExtra(extra: string | null): GoogleAdsLinkExtra | null {
  if (!extra) return null;
  try {
    const parsed = JSON.parse(extra) as GoogleAdsLinkExtra;
    if (!parsed.googleConnectionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export type GoogleAdsSyncResult = {
  connectionId: string;
  campaignsUpserted: number;
  insightsUpserted: number;
  windowDays: number;
};

export async function syncGoogleAdsConnection(
  connectionId: string,
  opts: { windowDays?: number } = {},
): Promise<GoogleAdsSyncResult> {
  const windowDays = opts.windowDays ?? 7;

  const conn = await prisma.adConnection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new Error("AdConnection не найдено");
  if (conn.platform !== "GOOGLE") throw new Error("Не Google-подключение");

  const link = parseExtra(conn.extra ?? null);
  if (!link) throw new Error("AdConnection.extra не содержит googleConnectionId");

  const { accessToken, connection: gconn } = await getGoogleAccessToken(link.googleConnectionId);
  if (gconn.orgId && gconn.orgId !== conn.orgId) {
    throw new Error("GoogleConnection принадлежит другой организации");
  }

  const developerToken =
    link.developerToken?.trim() || gconn.adsDeveloperToken?.trim() || "";
  if (!developerToken) {
    throw new Error("developer-token не задан (GoogleConnection.adsDeveloperToken или extra)");
  }
  const loginCustomerId = link.loginCustomerId?.trim() || null;

  // 1. Каталог кампаний
  const catalog = await fetchGoogleAdsCampaignsCatalog(
    conn.accountId,
    accessToken,
    developerToken,
    loginCustomerId,
  );
  let campaignsUpserted = 0;
  for (const r of catalog) {
    const id = r.campaign?.id;
    const name = r.campaign?.name;
    if (!id || !name) continue;
    const budget = r.campaignBudget?.amountMicros
      ? microsToCurrency(r.campaignBudget.amountMicros)
      : null;
    await prisma.adCampaign.upsert({
      where: {
        connectionId_externalId: {
          connectionId: conn.id,
          externalId: id,
        },
      },
      create: {
        orgId: conn.orgId,
        connectionId: conn.id,
        platform: "GOOGLE",
        externalId: id,
        name,
        status: r.campaign?.status ?? null,
        objective: r.campaign?.advertisingChannelType ?? null,
        dailyBudget: budget,
      },
      update: {
        name,
        status: r.campaign?.status ?? null,
        objective: r.campaign?.advertisingChannelType ?? null,
        dailyBudget: budget,
      },
    });
    campaignsUpserted += 1;
  }

  // 2. Daily insights
  const until = ymd(new Date());
  const since = ymd(new Date(Date.now() - windowDays * 24 * 3600 * 1000));
  const rows = await fetchGoogleAdsDailyInsights(
    conn.accountId,
    accessToken,
    developerToken,
    since,
    until,
    loginCustomerId,
  );

  const dbCampaigns = await prisma.adCampaign.findMany({
    where: { connectionId: conn.id },
    select: { id: true, externalId: true },
  });
  const campaignIdByExt = new Map(dbCampaigns.map((c) => [c.externalId, c.id]));

  let insightsUpserted = 0;
  for (const r of rows) {
    const ext = r.campaign?.id;
    const day = r.segments?.date;
    if (!ext || !day) continue;
    const campaignDbId = campaignIdByExt.get(ext);
    if (!campaignDbId) continue;
    const date = parseDate(day);
    const m = r.metrics ?? {};
    // Google Ads metric "conversions" — дробное число (Float). Округляем для поля Int.
    const conversionsNum = Number(m.conversions ?? 0);
    const leads = Number.isFinite(conversionsNum) ? Math.round(conversionsNum) : 0;
    await prisma.adInsightsDaily.upsert({
      where: { campaignId_date: { campaignId: campaignDbId, date } },
      create: {
        orgId: conn.orgId,
        connectionId: conn.id,
        campaignId: campaignDbId,
        platform: "GOOGLE",
        date,
        impressions: Number(m.impressions ?? 0) | 0,
        clicks: Number(m.clicks ?? 0) | 0,
        spend: microsToCurrency(m.costMicros),
        leads,
        currency: r.customer?.currencyCode ?? null,
      },
      update: {
        impressions: Number(m.impressions ?? 0) | 0,
        clicks: Number(m.clicks ?? 0) | 0,
        spend: microsToCurrency(m.costMicros),
        leads,
        currency: r.customer?.currencyCode ?? null,
      },
    });
    insightsUpserted += 1;
  }

  await prisma.adConnection.update({
    where: { id: conn.id },
    data: { lastSyncAt: new Date(), lastError: null, status: "ACTIVE" },
  });

  return {
    connectionId: conn.id,
    campaignsUpserted,
    insightsUpserted,
    windowDays,
  };
}
