import { decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { DEFAULT_ORG_ID } from "@/lib/org/context";
import { attributeLead, type AttributionResult } from "@/lib/tracking/attribute";
import { createBitrix24Client } from "./client";

/**
 * Попытаться атрибутировать Bitrix24 deal/lead по его ID.
 * Тянем сущность через `crm.deal.get` / `crm.lead.get`, достаём
 * известные UF-поля и UTM и передаём в `attributeLead`.
 *
 * Мягкая обработка ошибок: если API недоступен или поля пустые — возвращаем null.
 */

const UF_VISITOR = ["UF_CRM_VISITOR_ID", "UF_CRM_VISITORID", "UF_VISITOR_ID"];
const UF_FBCLID = ["UF_CRM_FBCLID", "UF_FBCLID"];
const UF_GCLID = ["UF_CRM_GCLID", "UF_GCLID"];
const UF_TTCLID = ["UF_CRM_TTCLID", "UF_TTCLID"];
const UF_UTM_SRC = ["UTM_SOURCE", "UF_CRM_UTM_SOURCE"];
const UF_UTM_CAM = ["UTM_CAMPAIGN", "UF_CRM_UTM_CAMPAIGN"];

function pickFirst(row: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (v == null) continue;
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

export type BitrixEntityType = "deal" | "lead";

export async function attributeBitrixEntity(
  connectionId: string,
  entityType: BitrixEntityType,
  entityId: string,
): Promise<AttributionResult | null> {
  const conn = await prisma.crmConnection.findUnique({
    where: { id: connectionId },
  });
  if (!conn || conn.crmType !== "bitrix24" || !conn.isActive) return null;
  if (!conn.bitrixDomain || !conn.bitrixUserId || !conn.bitrixWebhookToken) {
    return null;
  }
  const token = decrypt(conn.bitrixWebhookToken);

  const client = createBitrix24Client({
    domain: conn.bitrixDomain,
    userId: conn.bitrixUserId,
    webhookToken: token,
  });

  const method = entityType === "deal" ? "crm.deal.get" : "crm.lead.get";
  let row: Record<string, unknown> | null = null;
  try {
    const res = await client.call<Record<string, unknown>>(method, {
      id: entityId,
    });
    const r = res.result;
    if (r && typeof r === "object" && !Array.isArray(r)) {
      row = r as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  if (!row) return null;

  const visitorId = pickFirst(row, UF_VISITOR);
  const fbclid = pickFirst(row, UF_FBCLID);
  const gclid = pickFirst(row, UF_GCLID);
  const ttclid = pickFirst(row, UF_TTCLID);
  const utmSource = pickFirst(row, UF_UTM_SRC);
  const utmCampaign = pickFirst(row, UF_UTM_CAM);

  // Если вообще нет сигналов — пропускаем, чтобы не плодить 0-confidence строки.
  const hasSignal =
    visitorId || fbclid || gclid || ttclid || utmSource || utmCampaign;
  if (!hasSignal) return null;

  try {
    return await attributeLead({
      orgId: conn.orgId ?? DEFAULT_ORG_ID,
      crmDealId: entityId,
      crmType: "bitrix24",
      match: { visitorId, fbclid, gclid, ttclid },
      fallbackUtm: { utmSource, utmCampaign },
    });
  } catch {
    return null;
  }
}
