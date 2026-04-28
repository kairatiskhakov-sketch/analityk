import { jsonError, jsonOk } from "@/lib/http/json";
import { resolveOrgId } from "@/lib/org/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/ads/roi?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Агрегирует расходы из AdInsightsDaily (Meta/TikTok/Google) и
 * атрибутированные сделки из LeadAttribution (сматчены с campaign/platform).
 *
 * Ответ:
 *   overall    — сумма по всем платформам
 *   byPlatform — разбивка META / TIKTOK / GOOGLE
 *   byCampaign — топ-кампании с затратами и количеством сделок
 */

function parseDate(v: string | null, fallback: Date): Date {
  if (!v) return fallback;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

type PlatformAgg = {
  platform: "META" | "TIKTOK" | "GOOGLE";
  spend: number;
  impressions: number;
  clicks: number;
  leads: number; // из AdInsightsDaily (с площадки)
  attributedDeals: number; // из LeadAttribution (матч в нашей БД)
  cpl: number | null;
  cpDeal: number | null;
};

type CampaignAgg = {
  campaignId: string;
  name: string;
  platform: "META" | "TIKTOK" | "GOOGLE";
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  attributedDeals: number;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  cpl: number | null;
  cpDeal: number | null;
};

type DailyPoint = {
  date: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
};

function safeDivide(num: number, den: number): number | null {
  if (!den || !Number.isFinite(den)) return null;
  const v = num / den;
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

export async function GET(req: Request) {
  try {
    const orgId = await resolveOrgId();

    const url = new URL(req.url);
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);

    const from = parseDate(url.searchParams.get("from"), defaultFrom);
    const to = parseDate(url.searchParams.get("to"), now);
    if (from > to) return jsonError("from должен быть <= to");

    // 1. Агрегация трат/показов/кликов/лидов с платформ.
    const insightsByPlatform = await prisma.adInsightsDaily.groupBy({
      by: ["platform"],
      where: { orgId, date: { gte: from, lte: to } },
      _sum: { spend: true, impressions: true, clicks: true, leads: true },
    });

    const insightsByCampaign = await prisma.adInsightsDaily.groupBy({
      by: ["campaignId", "platform"],
      where: { orgId, date: { gte: from, lte: to } },
      _sum: { spend: true, leads: true, impressions: true, clicks: true },
      orderBy: { _sum: { spend: "desc" } },
      take: 50,
    });

    const withDaily = url.searchParams.get("withDaily") === "1";
    const dailySeries = withDaily
      ? await prisma.adInsightsDaily.groupBy({
          by: ["date"],
          where: { orgId, date: { gte: from, lte: to } },
          _sum: {
            spend: true,
            impressions: true,
            clicks: true,
            leads: true,
          },
          orderBy: { date: "asc" },
        })
      : [];

    const campaignIds = insightsByCampaign.map((r) => r.campaignId);
    const campaigns = campaignIds.length
      ? await prisma.adCampaign.findMany({
          where: { id: { in: campaignIds } },
          select: { id: true, name: true },
        })
      : [];
    const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));

    // 2. Агрегация атрибутированных сделок (только с campaignId).
    //    createdAt LeadAttribution — это момент матча (≈ создание сделки в CRM).
    const attrByPlatform = await prisma.leadAttribution.groupBy({
      by: ["platform"],
      where: {
        orgId,
        createdAt: { gte: from, lte: new Date(to.getTime() + 86_399_000) },
        platform: { not: null },
      },
      _count: { _all: true },
    });

    const attrByCampaign = await prisma.leadAttribution.groupBy({
      by: ["campaignId"],
      where: {
        orgId,
        createdAt: { gte: from, lte: new Date(to.getTime() + 86_399_000) },
        campaignId: { not: null },
      },
      _count: { _all: true },
    });

    // 3. Сборка byPlatform.
    const platformAttrMap = new Map<string, number>();
    for (const r of attrByPlatform) {
      if (r.platform) platformAttrMap.set(r.platform, r._count._all);
    }

    const byPlatform: PlatformAgg[] = insightsByPlatform.map((r) => {
      const spend = Number(r._sum.spend ?? 0);
      const leads = Number(r._sum.leads ?? 0);
      const attributedDeals = platformAttrMap.get(r.platform) ?? 0;
      return {
        platform: r.platform,
        spend: Math.round(spend * 100) / 100,
        impressions: Number(r._sum.impressions ?? 0),
        clicks: Number(r._sum.clicks ?? 0),
        leads,
        attributedDeals,
        cpl: safeDivide(spend, leads),
        cpDeal: safeDivide(spend, attributedDeals),
      };
    });

    // 4. Сборка byCampaign.
    const campaignAttrMap = new Map<string, number>();
    for (const r of attrByCampaign) {
      if (r.campaignId) campaignAttrMap.set(r.campaignId, r._count._all);
    }

    const byCampaign: CampaignAgg[] = insightsByCampaign.map((r) => {
      const spend = Number(r._sum.spend ?? 0);
      const leads = Number(r._sum.leads ?? 0);
      const impressions = Number(r._sum.impressions ?? 0);
      const clicks = Number(r._sum.clicks ?? 0);
      const attributedDeals = campaignAttrMap.get(r.campaignId) ?? 0;
      return {
        campaignId: r.campaignId,
        name: campaignName.get(r.campaignId) ?? "—",
        platform: r.platform,
        spend: Math.round(spend * 100) / 100,
        impressions,
        clicks,
        leads,
        attributedDeals,
        ctr: safeDivide(clicks * 100, impressions),
        cpm: safeDivide(spend * 1000, impressions),
        cpc: safeDivide(spend, clicks),
        cpl: safeDivide(spend, leads),
        cpDeal: safeDivide(spend, attributedDeals),
      };
    });

    // 5. Overall.
    const overall = byPlatform.reduce(
      (acc, p) => {
        acc.spend += p.spend;
        acc.impressions += p.impressions;
        acc.clicks += p.clicks;
        acc.leads += p.leads;
        acc.attributedDeals += p.attributedDeals;
        return acc;
      },
      { spend: 0, impressions: 0, clicks: 0, leads: 0, attributedDeals: 0 },
    );

    const daily: DailyPoint[] = dailySeries.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      spend: Math.round(Number(r._sum.spend ?? 0) * 100) / 100,
      impressions: Number(r._sum.impressions ?? 0),
      clicks: Number(r._sum.clicks ?? 0),
      leads: Number(r._sum.leads ?? 0),
    }));

    return jsonOk({
      range: {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
      },
      overall: {
        ...overall,
        spend: Math.round(overall.spend * 100) / 100,
        cpl: safeDivide(overall.spend, overall.leads),
        cpDeal: safeDivide(overall.spend, overall.attributedDeals),
        ctr: safeDivide(overall.clicks * 100, overall.impressions),
        cpm: safeDivide(overall.spend * 1000, overall.impressions),
        cpc: safeDivide(overall.spend, overall.clicks),
      },
      byPlatform,
      byCampaign,
      ...(withDaily ? { daily } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
