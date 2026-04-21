/**
 * Синхронизация TikTok Ads:
 * - Каталог кампаний (campaign/get).
 * - Daily insights за окно windowDays (report/integrated/get).
 */

import { decrypt } from "@/lib/crypto";
import {
  fetchTiktokCampaigns,
  fetchTiktokReportsDaily,
} from "@/lib/integrations/tiktok/client";
import { prisma } from "@/lib/prisma";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDate(s: string): Date {
  // TikTok отдаёт stat_time_day как "YYYY-MM-DD 00:00:00" либо "YYYY-MM-DD".
  const date = s.includes(" ") ? s.split(" ")[0]! : s;
  return new Date(`${date}T00:00:00.000Z`);
}

export type TiktokSyncResult = {
  connectionId: string;
  campaignsUpserted: number;
  insightsUpserted: number;
  windowDays: number;
};

export async function syncTiktokConnection(
  connectionId: string,
  opts: { windowDays?: number } = {},
): Promise<TiktokSyncResult> {
  const windowDays = opts.windowDays ?? 7;

  const conn = await prisma.adConnection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new Error("AdConnection не найдено");
  if (conn.platform !== "TIKTOK") throw new Error("Не TikTok-подключение");

  const token = decrypt(conn.accessToken);
  if (!token) throw new Error("Нет access token");

  // 1. Кампании
  const campaigns = await fetchTiktokCampaigns(conn.accountId, token);
  let campaignsUpserted = 0;
  for (const c of campaigns) {
    await prisma.adCampaign.upsert({
      where: {
        connectionId_externalId: {
          connectionId: conn.id,
          externalId: c.campaign_id,
        },
      },
      create: {
        orgId: conn.orgId,
        connectionId: conn.id,
        platform: "TIKTOK",
        externalId: c.campaign_id,
        name: c.campaign_name,
        status: c.operation_status ?? null,
        objective: c.objective_type ?? null,
        dailyBudget: typeof c.budget === "number" ? c.budget : null,
      },
      update: {
        name: c.campaign_name,
        status: c.operation_status ?? null,
        objective: c.objective_type ?? null,
        dailyBudget: typeof c.budget === "number" ? c.budget : null,
      },
    });
    campaignsUpserted += 1;
  }

  // 2. Daily insights
  const endDate = ymd(new Date());
  const startDate = ymd(new Date(Date.now() - windowDays * 24 * 3600 * 1000));
  const rows = await fetchTiktokReportsDaily(
    conn.accountId,
    token,
    startDate,
    endDate,
  );

  const dbCampaigns = await prisma.adCampaign.findMany({
    where: { connectionId: conn.id },
    select: { id: true, externalId: true },
  });
  const campaignIdByExt = new Map(dbCampaigns.map((c) => [c.externalId, c.id]));

  let insightsUpserted = 0;
  for (const r of rows) {
    const ext = r.dimensions?.campaign_id;
    const day = r.dimensions?.stat_time_day;
    if (!ext || !day) continue;
    const campaignDbId = campaignIdByExt.get(ext);
    if (!campaignDbId) continue;
    const date = parseDate(day);
    const m = r.metrics ?? {};
    await prisma.adInsightsDaily.upsert({
      where: {
        campaignId_date: { campaignId: campaignDbId, date },
      },
      create: {
        orgId: conn.orgId,
        connectionId: conn.id,
        campaignId: campaignDbId,
        platform: "TIKTOK",
        date,
        impressions: Number(m.impressions ?? 0) | 0,
        clicks: Number(m.clicks ?? 0) | 0,
        spend: Number(m.spend ?? 0),
        leads: Number(m.conversion ?? 0) | 0,
        currency: m.currency ?? null,
      },
      update: {
        impressions: Number(m.impressions ?? 0) | 0,
        clicks: Number(m.clicks ?? 0) | 0,
        spend: Number(m.spend ?? 0),
        leads: Number(m.conversion ?? 0) | 0,
        currency: m.currency ?? null,
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
