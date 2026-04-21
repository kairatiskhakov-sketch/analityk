import { decrypt, encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { DEFAULT_ORG_ID } from "@/lib/org/context";
import { attributeLead, type AttributionResult } from "@/lib/tracking/attribute";
import { createAmoClient } from "./client";
import { amoTokenExpiresAt, refreshAmoAccessToken } from "./oauth";

/**
 * Атрибуция AmoCRM lead по ID: достаёт custom_fields (по именам полей,
 * совпадение по FIELD_NAME без регистра) и передаёт в `attributeLead`.
 *
 * Поля, которые ищем (по имени кастомного поля в Amo):
 *   visitor_id / visitorid / otv_visitor_id
 *   fbclid / gclid / ttclid
 *   utm_source / utm_campaign
 */

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

const NAME_VISITOR = ["visitor_id", "visitorid", "otv_visitor_id"];
const NAME_FBCLID = ["fbclid"];
const NAME_GCLID = ["gclid"];
const NAME_TTCLID = ["ttclid"];
const NAME_UTM_SRC = ["utm_source"];
const NAME_UTM_CAM = ["utm_campaign"];

type AmoCustomFieldValue = { value: unknown };
type AmoCustomField = {
  field_name?: string;
  field_code?: string;
  values?: AmoCustomFieldValue[];
};

function firstCustomFieldValue(
  fields: AmoCustomField[] | undefined,
  names: string[],
): string | null {
  if (!fields) return null;
  const lower = names.map((n) => n.toLowerCase());
  for (const f of fields) {
    const fn = String(f.field_name ?? "").toLowerCase();
    const fc = String(f.field_code ?? "").toLowerCase();
    if (!lower.includes(fn) && !lower.includes(fc)) continue;
    const v = f.values?.[0]?.value;
    if (v == null) continue;
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

async function ensureAmoAccessToken(
  conn: NonNullable<Awaited<ReturnType<typeof prisma.crmConnection.findUnique>>>,
): Promise<string | null> {
  if (!conn.amoSubdomain || !conn.amoAccessToken || !conn.amoRefreshToken) return null;
  if (!conn.amoClientId || !conn.amoClientSecret) return null;
  const redirectUri = process.env.AMOCRM_REDIRECT_URI;
  if (!redirectUri) return null;

  const expiresAt = conn.amoTokenExpiresAt;
  const needRefresh =
    !expiresAt || expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS;

  if (!needRefresh) {
    return decrypt(conn.amoAccessToken);
  }

  try {
    const refreshed = await refreshAmoAccessToken(conn.amoSubdomain, {
      clientId: conn.amoClientId,
      clientSecret: decrypt(conn.amoClientSecret),
      refreshToken: decrypt(conn.amoRefreshToken),
      redirectUri,
    });
    await prisma.crmConnection.update({
      where: { id: conn.id },
      data: {
        amoAccessToken: encrypt(refreshed.access_token),
        amoRefreshToken: encrypt(refreshed.refresh_token),
        amoTokenExpiresAt: amoTokenExpiresAt(refreshed),
      },
    });
    return refreshed.access_token;
  } catch {
    return null;
  }
}

export async function attributeAmoLead(
  connectionId: string,
  leadId: number | string,
): Promise<AttributionResult | null> {
  const conn = await prisma.crmConnection.findUnique({
    where: { id: connectionId },
  });
  if (!conn || conn.crmType !== "amocrm" || !conn.isActive) return null;

  const accessToken = await ensureAmoAccessToken(conn);
  if (!accessToken || !conn.amoSubdomain) return null;

  const client = createAmoClient(conn.amoSubdomain, accessToken);
  let lead: { custom_fields_values?: AmoCustomField[] } | null = null;
  try {
    const { data } = await client.get<{ custom_fields_values?: AmoCustomField[] }>(
      `/leads/${leadId}`,
    );
    lead = data;
  } catch {
    return null;
  }
  if (!lead) return null;

  const fields = lead.custom_fields_values;
  const visitorId = firstCustomFieldValue(fields, NAME_VISITOR);
  const fbclid = firstCustomFieldValue(fields, NAME_FBCLID);
  const gclid = firstCustomFieldValue(fields, NAME_GCLID);
  const ttclid = firstCustomFieldValue(fields, NAME_TTCLID);
  const utmSource = firstCustomFieldValue(fields, NAME_UTM_SRC);
  const utmCampaign = firstCustomFieldValue(fields, NAME_UTM_CAM);

  const hasSignal =
    visitorId || fbclid || gclid || ttclid || utmSource || utmCampaign;
  if (!hasSignal) return null;

  try {
    return await attributeLead({
      orgId: conn.orgId ?? DEFAULT_ORG_ID,
      crmDealId: String(leadId),
      crmType: "amocrm",
      match: { visitorId, fbclid, gclid, ttclid },
      fallbackUtm: { utmSource, utmCampaign },
    });
  } catch {
    return null;
  }
}
