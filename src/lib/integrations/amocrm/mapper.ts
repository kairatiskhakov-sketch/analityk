import type { UnifiedLead } from "@/lib/integrations/shared/mapper";
import type { AmoCustomFieldValue, AmoLead, AmoPipeline } from "./types";

export type UnifiedLeadFromAmo = UnifiedLead;

/** Резерв из ТЗ: конкретный status_id как «провал» (если нет type в воронке). */
export const AMO_FALLBACK_LOST_STATUS_ID = 143;

type StatusIndex = Map<string, { type?: number }>;

function buildStatusIndex(pipelines: AmoPipeline[]): StatusIndex {
  const m = new Map<string, { type?: number }>();
  for (const p of pipelines) {
    const statuses = p._embedded?.statuses ?? [];
    for (const st of statuses) {
      m.set(`${p.id}:${st.id}`, { type: st.type });
    }
  }
  return m;
}

function getStatusType(
  pipelineId: number,
  statusId: number,
  index: StatusIndex,
): number | undefined {
  return index.get(`${pipelineId}:${statusId}`)?.type;
}

function extractUtmFromCustomFields(
  fields: AmoCustomFieldValue[] | undefined,
): Pick<
  UnifiedLead,
  "utmSource" | "utmMedium" | "utmCampaign" | "utmContent" | "gclid" | "fbclid"
> {
  const out: ReturnType<typeof extractUtmFromCustomFields> = {};
  if (!fields?.length) return out;

  for (const f of fields) {
    const code = (f.field_code ?? f.field_name ?? "").toLowerCase();
    const val = f.values?.[0]?.value;
    const s = val == null ? "" : String(val);
    if (!s) continue;

    if (code.includes("utm_source") || code === "utm_source") out.utmSource = s;
    else if (code.includes("utm_medium") || code === "utm_medium") out.utmMedium = s;
    else if (code.includes("utm_campaign") || code === "utm_campaign") out.utmCampaign = s;
    else if (code.includes("utm_content") || code === "utm_content") out.utmContent = s;
    else if (code.includes("gclid")) out.gclid = s;
    else if (code.includes("fbclid")) out.fbclid = s;
  }

  return out;
}

function pickPhoneEmailFromFields(
  fields: AmoCustomFieldValue[] | undefined,
): { phone?: string; email?: string } {
  let phone: string | undefined;
  let email: string | undefined;
  if (!fields?.length) return {};
  for (const f of fields) {
    const code = (f.field_code ?? f.field_name ?? "").toUpperCase();
    const v = f.values?.[0]?.value;
    const str = v == null ? "" : String(v);
    if (!str) continue;
    if (code.includes("PHONE")) phone = str;
    if (code.includes("EMAIL")) email = str;
  }
  return { phone, email };
}

function pickContactPhoneEmail(lead: AmoLead): { phone?: string; email?: string } {
  const fromLead = pickPhoneEmailFromFields(lead.custom_fields_values);
  if (fromLead.phone || fromLead.email) return fromLead;

  const contacts = lead._embedded?.contacts ?? [];
  for (const c of contacts) {
    const cf = c.custom_fields_values ?? [];
    let phone: string | undefined;
    let email: string | undefined;
    for (const f of cf) {
      const code = (f.field_code ?? f.field_name ?? "").toUpperCase();
      const v = f.values?.[0]?.value;
      const str = v == null ? "" : String(v);
      if (!str) continue;
      if (code.includes("PHONE") || code === "PHONE") phone = str;
      if (code.includes("EMAIL") || code === "EMAIL") email = str;
    }
    if (phone || email) return { phone, email };
  }
  return {};
}

/**
 * Маппинг лида AmoCRM → унифицированная модель.
 * `lossReasonById` — подписи причин отказа; `pipelines` — для type этапа (успех/провал).
 */
export function mapAmoLeadToUnified(
  lead: AmoLead,
  ctx: {
    pipelines: AmoPipeline[];
    lossReasonById: Map<number, string>;
  },
): UnifiedLead {
  const idx = buildStatusIndex(ctx.pipelines);
  const stType = getStatusType(lead.pipeline_id, lead.status_id, idx);

  let status: string;
  if (stType === 1) {
    status = "won";
  } else if (stType === 2 || lead.loss_reason_id) {
    status = "lost";
  } else if (lead.status_id === AMO_FALLBACK_LOST_STATUS_ID) {
    status = "lost";
  } else {
    status = "in_progress";
  }

  const lossName = lead.loss_reason_id
    ? ctx.lossReasonById.get(lead.loss_reason_id)
    : undefined;
  const embeddedLoss = lead._embedded?.loss_reason?.[0]?.name;

  const utm = extractUtmFromCustomFields(lead.custom_fields_values);
  const { phone, email } = pickContactPhoneEmail(lead);

  const createdAt = new Date(lead.created_at * 1000);
  const closedAt =
    lead.closed_at != null && lead.closed_at > 0
      ? new Date(lead.closed_at * 1000)
      : undefined;

  const source =
    utm.utmSource?.trim() ||
    utm.utmCampaign?.trim() ||
    "amocrm";

  return {
    externalId: String(lead.id),
    name: lead.name?.trim() || "Без названия",
    phone: phone ?? null,
    email: email ?? null,
    source,
    utmSource: utm.utmSource ?? null,
    utmMedium: utm.utmMedium ?? null,
    utmCampaign: utm.utmCampaign ?? null,
    utmContent: utm.utmContent ?? null,
    gclid: utm.gclid ?? null,
    fbclid: utm.fbclid ?? null,
    managerExternalId: String(lead.responsible_user_id),
    status,
    amount: typeof lead.price === "number" ? lead.price : 0,
    failReason: lossName ?? embeddedLoss ?? null,
    createdAt,
    closedAt: closedAt ?? null,
  };
}
