/**
 * Хелпер атрибуции CRM-сделки к рекламной кампании.
 * Вызывается из CRM-webhook хендлеров при получении нового deal:
 *   await attributeLead({ orgId, crmDealId: "123", crmType: "bitrix24",
 *     match: { visitorId, fbclid, gclid, ttclid, email, phone } });
 *
 * Порядок приоритета матчинга (чем выше, тем больше confidence):
 *   1. visitorId     — 1.00 (cookie pass-through через форму)
 *   2. fbclid        — 0.95 (прямая клик-атрибуция Meta)
 *   3. gclid         — 0.95
 *   4. ttclid        — 0.95
 *   5. email/phone   — 0.60 (последний touch с таким fingerprint)
 *   6. fallback UTM  — 0.30 (без матча туча, только UTM из payload)
 */

import { prisma } from "@/lib/prisma";

export type AttributeLeadInput = {
  orgId: string;
  crmDealId: string;
  crmType: string; // "bitrix24" | "amocrm"
  match: {
    visitorId?: string | null;
    fbclid?: string | null;
    gclid?: string | null;
    ttclid?: string | null;
    email?: string | null; // зарезервировано (пока не используем — нужен fingerprint)
    phone?: string | null;
  };
  fallbackUtm?: {
    utmSource?: string | null;
    utmCampaign?: string | null;
  };
};

export type AttributionResult = {
  attributionId: string;
  touchId: string | null;
  matchedBy: string | null;
  confidence: number;
};

type TouchMatch = {
  touchId: string;
  matchedBy: string;
  confidence: number;
  utmSource: string | null;
  utmCampaign: string | null;
  fbclid: string | null;
  gclid: string | null;
  ttclid: string | null;
};

async function findTouch(
  orgId: string,
  match: AttributeLeadInput["match"],
): Promise<TouchMatch | null> {
  // 1. visitorId
  if (match.visitorId) {
    const t = await prisma.trackingTouch.findFirst({
      where: { orgId, visitorId: match.visitorId },
      orderBy: { createdAt: "desc" },
    });
    if (t) {
      return {
        touchId: t.id,
        matchedBy: "visitorId",
        confidence: 1.0,
        utmSource: t.utmSource,
        utmCampaign: t.utmCampaign,
        fbclid: t.fbclid,
        gclid: t.gclid,
        ttclid: t.ttclid,
      };
    }
  }
  // 2-4. click-id
  const clickIdChecks: Array<[string, string | null | undefined]> = [
    ["fbclid", match.fbclid],
    ["gclid", match.gclid],
    ["ttclid", match.ttclid],
  ];
  for (const [field, value] of clickIdChecks) {
    if (!value) continue;
    const t = await prisma.trackingTouch.findFirst({
      where: { orgId, [field]: value } as Record<string, unknown>,
      orderBy: { createdAt: "desc" },
    });
    if (t) {
      return {
        touchId: t.id,
        matchedBy: field,
        confidence: 0.95,
        utmSource: t.utmSource,
        utmCampaign: t.utmCampaign,
        fbclid: t.fbclid,
        gclid: t.gclid,
        ttclid: t.ttclid,
      };
    }
  }
  return null;
}

function inferPlatform(touch: TouchMatch | null): "META" | "TIKTOK" | "GOOGLE" | null {
  if (!touch) return null;
  if (touch.fbclid) return "META";
  if (touch.ttclid) return "TIKTOK";
  if (touch.gclid) return "GOOGLE";
  const src = (touch.utmSource ?? "").toLowerCase();
  if (src.includes("facebook") || src.includes("instagram") || src === "meta") return "META";
  if (src.includes("tiktok")) return "TIKTOK";
  if (src.includes("google")) return "GOOGLE";
  return null;
}

async function findCampaignByUtm(
  orgId: string,
  platform: "META" | "TIKTOK" | "GOOGLE" | null,
  utmCampaign: string | null,
): Promise<string | null> {
  if (!platform || !utmCampaign) return null;
  const c = await prisma.adCampaign.findFirst({
    where: {
      orgId,
      platform,
      name: { equals: utmCampaign, mode: "insensitive" },
    },
    select: { id: true },
  });
  return c?.id ?? null;
}

export async function attributeLead(input: AttributeLeadInput): Promise<AttributionResult> {
  const touch = await findTouch(input.orgId, input.match);
  const platform = inferPlatform(touch);
  const utmCampaign = touch?.utmCampaign ?? input.fallbackUtm?.utmCampaign ?? null;
  const utmSource = touch?.utmSource ?? input.fallbackUtm?.utmSource ?? null;
  const campaignId = await findCampaignByUtm(input.orgId, platform, utmCampaign);
  const clickId = touch?.fbclid ?? touch?.gclid ?? touch?.ttclid ?? null;

  const matchedBy = touch?.matchedBy ?? (utmCampaign ? "utm" : null);
  const confidence = touch?.confidence ?? (utmCampaign ? 0.3 : 0);

  const attribution = await prisma.leadAttribution.upsert({
    where: {
      orgId_crmDealId_crmType: {
        orgId: input.orgId,
        crmDealId: input.crmDealId,
        crmType: input.crmType,
      },
    },
    create: {
      orgId: input.orgId,
      crmDealId: input.crmDealId,
      crmType: input.crmType,
      touchId: touch?.touchId ?? null,
      campaignId,
      platform,
      utmSource,
      utmCampaign,
      clickId,
      matchedBy,
      confidence,
    },
    update: {
      touchId: touch?.touchId ?? null,
      campaignId,
      platform,
      utmSource,
      utmCampaign,
      clickId,
      matchedBy,
      confidence,
    },
  });

  return {
    attributionId: attribution.id,
    touchId: attribution.touchId,
    matchedBy: attribution.matchedBy,
    confidence: attribution.confidence,
  };
}
