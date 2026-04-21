/**
 * Синхронизация Meta Ads insights в БД.
 * - Обновляет список кампаний.
 * - Снимает daily insights за окно (по умолчанию 7 дней) и апсёртит AdInsightsDaily.
 */

import { decrypt } from "@/lib/crypto";
import {
  fetchMetaCampaigns,
  fetchMetaInsightsDaily,
  sumLeadActions,
} from "@/lib/integrations/meta/client";
import { prisma } from "@/lib/prisma";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDate(s: string): Date {
  // insights возвращает даты YYYY-MM-DD — кладём ровно на UTC-полночь,
  // потому что поле date в БД — @db.Date.
  return new Date(`${s}T00:00:00.000Z`);
}

export type MetaSyncResult = {
  connectionId: string;
  campaignsUpserted: number;
  insightsUpserted: number;
  windowDays: number;
};

export async function syncMetaConnection(
  connectionId: string,
  opts: { windowDays?: number } = {},
): Promise<MetaSyncResult> {
  const windowDays = opts.windowDays ?? 7;

  const conn = await prisma.adConnection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new Error("AdConnection не найдено");
  if (conn.platform !== "META") throw new Error("Не Meta-подключение");

  const token = decrypt(conn.accessToken);
  if (!token) throw new Error("Нет access token");

  // 1. Обновляем каталог кампаний
  const campaigns = await fetchMetaCampaigns(conn.accountId, token);
  let campaignsUpserted = 0;
  for (const c of campaigns) {
    await prisma.adCampaign.upsert({
      where: {
        connectionId_externalId: {
          connectionId: conn.id,
          externalId: c.id,
        },
      },
      create: {
        orgId: conn.orgId,
        connectionId: conn.id,
        platform: "META",
        externalId: c.id,
        name: c.name,
        status: c.status ?? null,
        objective: c.objective ?? null,
        dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
      },
      update: {
        name: c.name,
        status: c.status ?? null,
        objective: c.objective ?? null,
        dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
      },
    });
    campaignsUpserted += 1;
  }

  // 2. Daily insights
  const until = ymd(new Date());
  const since = ymd(new Date(Date.now() - windowDays * 24 * 3600 * 1000));
  const rows = await fetchMetaInsightsDaily(conn.accountId, token, since, until);

  // map externalId → id в БД
  const dbCampaigns = await prisma.adCampaign.findMany({
    where: { connectionId: conn.id },
    select: { id: true, externalId: true },
  });
  const campaignIdByExt = new Map(dbCampaigns.map((c) => [c.externalId, c.id]));

  let insightsUpserted = 0;
  for (const r of rows) {
    if (!r.campaign_id) continue;
    const campaignDbId = campaignIdByExt.get(r.campaign_id);
    if (!campaignDbId) continue;
    const date = parseDate(r.date_start);
    await prisma.adInsightsDaily.upsert({
      where: {
        campaignId_date: { campaignId: campaignDbId, date },
      },
      create: {
        orgId: conn.orgId,
        connectionId: conn.id,
        campaignId: campaignDbId,
        platform: "META",
        date,
        impressions: Number(r.impressions ?? 0) | 0,
        clicks: Number(r.clicks ?? 0) | 0,
        spend: Number(r.spend ?? 0),
        leads: sumLeadActions(r),
        currency: r.account_currency ?? null,
      },
      update: {
        impressions: Number(r.impressions ?? 0) | 0,
        clicks: Number(r.clicks ?? 0) | 0,
        spend: Number(r.spend ?? 0),
        leads: sumLeadActions(r),
        currency: r.account_currency ?? null,
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
