import type { UnifiedLead } from "@/lib/integrations/shared/mapper";
import type { BitrixDealRow, BitrixLeadRow } from "./types";

/** Алиас для совместимости; предпочтительно `UnifiedLead` из shared */
export type UnifiedLeadFromBitrix = UnifiedLead;

export type UnifiedDealFromBitrix = {
  externalId: string;
  amount: number;
  source?: string | null;
  managerExternalId?: string | null;
  /** Bitrix CATEGORY_ID */
  pipelineId: string;
  stageId?: string | null;
  createdAt: Date;
  closedAt?: Date | null;
};

function pickStr(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

function pickNum(v: unknown): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

/** Bitrix может отдавать телефон строкой или массивом { VALUE } */
function pickPhone(row: BitrixLeadRow): string | undefined {
  const p = row.PHONE;
  if (typeof p === "string") return p;
  if (Array.isArray(p) && p.length > 0) {
    const first = p[0] as { VALUE?: string };
    if (first?.VALUE) return first.VALUE;
  }
  return undefined;
}

function pickEmail(row: BitrixLeadRow): string | undefined {
  const e = row.EMAIL;
  if (typeof e === "string") return e;
  if (Array.isArray(e) && e.length > 0) {
    const first = e[0] as { VALUE?: string };
    if (first?.VALUE) return first.VALUE;
  }
  return undefined;
}

function parseBitrixDate(v: unknown): Date | undefined {
  const s = pickStr(v);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Маппинг статуса лида по ТЗ + разумные дефолты.
 */
export function mapBitrixLeadStatus(statusId: string): string {
  const u = statusId.toUpperCase();
  if (u === "CONVERTED") return "won";
  if (u === "JUNK") return "lost";
  if (u === "NEW") return "new";
  return "in_progress";
}

function extractUtm(row: BitrixLeadRow): {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
} {
  const out: ReturnType<typeof extractUtm> = {};
  const keys = Object.keys(row);
  const lower = (k: string) => k.toLowerCase();

  for (const k of keys) {
    const lk = lower(k);
    const val = pickStr(row[k]);
    if (!val) continue;
    if (lk.includes("utm_source") || lk.endsWith("_utm_source")) out.utmSource = val;
    else if (lk.includes("utm_medium") || lk.endsWith("_utm_medium")) out.utmMedium = val;
    else if (lk.includes("utm_campaign") || lk.endsWith("_utm_campaign")) out.utmCampaign = val;
    else if (lk.includes("utm_content") || lk.endsWith("_utm_content")) out.utmContent = val;
    else if (lk.includes("gclid")) out.gclid = val;
    else if (lk.includes("fbclid")) out.fbclid = val;
  }

  return out;
}

export function mapBitrixLeadToUnified(
  row: BitrixLeadRow,
  maps?: {
    sourceById?: Map<string, string>;
    lostReasonById?: Map<string, string>;
  },
): UnifiedLead {
  const id = pickStr(row.ID);
  if (!id) throw new Error("Bitrix lead без ID");

  const sourceId = pickStr(row.SOURCE_ID) ?? "";
  const source =
    maps?.sourceById?.get(sourceId) ??
    (sourceId ? `source:${sourceId}` : "unknown");

  const statusId = pickStr(row.STATUS_ID) ?? "";
  const status = mapBitrixLeadStatus(statusId);

  const lostId = pickStr(row.LOST_REASON_ID);
  const failReason =
    lostId && maps?.lostReasonById?.has(lostId)
      ? maps.lostReasonById.get(lostId) ?? null
      : lostId || null;

  const utm = extractUtm(row);

  return {
    externalId: id,
    stageExternalId: statusId || null,
    name: pickStr(row.TITLE)?.trim() || "Без названия",
    phone: pickPhone(row) ?? null,
    email: pickEmail(row) ?? null,
    source,
    utmSource: utm.utmSource ?? null,
    utmMedium: utm.utmMedium ?? null,
    utmCampaign: utm.utmCampaign ?? null,
    utmContent: utm.utmContent ?? null,
    gclid: utm.gclid ?? null,
    fbclid: utm.fbclid ?? null,
    managerExternalId: pickStr(row.ASSIGNED_BY_ID) ?? null,
    status,
    amount: pickNum(row.OPPORTUNITY),
    failReason,
    createdAt: parseBitrixDate(row.CREATED_TIME) ?? new Date(),
    closedAt: parseBitrixDate(row.CLOSED_TIME) ?? null,
  };
}

export function mapBitrixDealToUnified(
  row: BitrixDealRow,
  sourceMap?: Map<string, string>,
): UnifiedDealFromBitrix {
  const id = pickStr(row.ID);
  if (!id) throw new Error("Bitrix deal без ID");

  const sourceId = pickStr(row.SOURCE_ID) ?? "";
  const source =
    sourceMap?.get(sourceId) ?? (sourceId ? `source:${sourceId}` : null);
  const stageId = pickStr(row.STAGE_ID) ?? null;
  const pipelineId = pickStr(row.CATEGORY_ID) ?? "0";

  return {
    externalId: id,
    amount: pickNum(row.OPPORTUNITY),
    source,
    managerExternalId: pickStr(row.ASSIGNED_BY_ID) ?? null,
    pipelineId,
    stageId,
    createdAt: parseBitrixDate(row.DATE_CREATE) ?? new Date(),
    closedAt: parseBitrixDate(row.CLOSEDATE) ?? parseBitrixDate(row.DATE_MODIFY) ?? null,
  };
}
