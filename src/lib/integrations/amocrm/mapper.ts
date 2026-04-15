import type { UnifiedLead } from "@/lib/integrations/shared/mapper";
import type { AmoCustomField, AmoLead, AmoPipeline, AmoStatus } from "./types";

export type UnifiedLeadFromAmo = UnifiedLead;

export const AMO_STATUS_WON = 142;
export const AMO_STATUS_LOST = 143;

export function amoLeadIsWon(lead: AmoLead): boolean {
  return lead.status_id === AMO_STATUS_WON;
}

export function amoLeadIsLost(lead: AmoLead): boolean {
  return lead.status_id === AMO_STATUS_LOST;
}

export function amoLeadInProgress(lead: AmoLead): boolean {
  return !amoLeadIsWon(lead) && !amoLeadIsLost(lead);
}

export function amoStatusType(
  status: AmoStatus,
): "won" | "lost" | "progress" | "ignore" {
  if (status.id === AMO_STATUS_WON) return "won";
  if (status.id === AMO_STATUS_LOST) return "lost";
  if (status.type === 1) return "ignore";
  return "progress";
}

export function extractAmoUTM(lead: AmoLead): {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
} {
  const fields = lead.custom_fields_values ?? [];
  const findField = (codes: string[]) => {
    for (const code of codes) {
      const lc = code.toLowerCase();
      const field = fields.find(
        (f) =>
          (f.field_code ?? "").toLowerCase() === lc ||
          (f.field_name ?? "").toLowerCase() === lc,
      );
      const value = field?.values?.[0]?.value;
      if (value != null && String(value).trim()) return String(value);
    }
    return undefined;
  };
  return {
    source: findField(["utm_source", "UTM_SOURCE"]),
    medium: findField(["utm_medium", "UTM_MEDIUM"]),
    campaign: findField(["utm_campaign", "UTM_CAMPAIGN"]),
    content: findField(["utm_content", "UTM_CONTENT"]),
    term: findField(["utm_term", "UTM_TERM"]),
  };
}

function pickPhoneEmailFromFields(
  fields: AmoCustomField[] | null | undefined,
): { phone?: string; email?: string } {
  let phone: string | undefined;
  let email: string | undefined;
  for (const f of fields ?? []) {
    const code = `${f.field_code ?? ""} ${f.field_name ?? ""}`.toUpperCase();
    const v = f.values?.[0]?.value;
    if (v == null || String(v).trim() === "") continue;
    if (!phone && code.includes("PHONE")) phone = String(v);
    if (!email && code.includes("EMAIL")) email = String(v);
  }
  return { phone, email };
}

function pickContactPhoneEmail(lead: AmoLead): { phone?: string; email?: string } {
  const fromLead = pickPhoneEmailFromFields(lead.custom_fields_values);
  if (fromLead.phone || fromLead.email) return fromLead;

  const contacts = lead._embedded?.contacts ?? [];
  for (const c of contacts) {
    const { phone, email } = pickPhoneEmailFromFields(c.custom_fields_values);
    if (phone || email) return { phone, email };
  }
  return {};
}

export function mapAmoLead(lead: AmoLead, pipelineName?: string) {
  const utm = extractAmoUTM(lead);
  return {
    externalId: String(lead.id),
    crmType: "amocrm" as const,
    name: lead.name || `Сделка #${lead.id}`,
    status: amoLeadIsWon(lead)
      ? "won"
      : amoLeadIsLost(lead)
        ? "lost"
        : "progress",
    amount: lead.price || 0,
    externalManagerId: String(lead.responsible_user_id),
    pipelineId: String(lead.pipeline_id),
    pipelineName: pipelineName ?? lead._embedded?.pipeline?.name,
    stageId: String(lead.status_id),
    failReasonId: lead.loss_reason_id ? String(lead.loss_reason_id) : null,
    utmSource: utm.source,
    utmMedium: utm.medium,
    utmCampaign: utm.campaign,
    utmContent: utm.content,
    createdAt: new Date(lead.created_at * 1000),
    closedAt: lead.closed_at ? new Date(lead.closed_at * 1000) : null,
    updatedAt: new Date(lead.updated_at * 1000),
  };
}

export function mapAmoLeadToUnified(
  lead: AmoLead,
  ctx: {
    pipelines: AmoPipeline[];
    lossReasonById: Map<number, string>;
  },
): UnifiedLead {
  const status = amoLeadIsWon(lead)
    ? "won"
    : amoLeadIsLost(lead)
      ? "lost"
      : "in_progress";

  const lossName = lead.loss_reason_id
    ? ctx.lossReasonById.get(lead.loss_reason_id)
    : undefined;
  const embeddedLoss = lead._embedded?.loss_reason?.[0]?.name;

  const utm = extractAmoUTM(lead);
  const { phone, email } = pickContactPhoneEmail(lead);

  const createdAt = new Date(lead.created_at * 1000);
  const closedAt =
    lead.closed_at != null && lead.closed_at > 0
      ? new Date(lead.closed_at * 1000)
      : undefined;

  const source = utm.source?.trim() || utm.campaign?.trim() || "amocrm";

  return {
    externalId: String(lead.id),
    name: lead.name?.trim() || "Без названия",
    phone: phone ?? null,
    email: email ?? null,
    source,
    utmSource: utm.source ?? null,
    utmMedium: utm.medium ?? null,
    utmCampaign: utm.campaign ?? null,
    utmContent: utm.content ?? null,
    gclid: null,
    fbclid: null,
    managerExternalId: String(lead.responsible_user_id),
    status,
    stageExternalId: String(lead.status_id),
    amount: typeof lead.price === "number" ? lead.price : 0,
    failReason: lossName ?? embeddedLoss ?? null,
    createdAt,
    closedAt: closedAt ?? null,
  };
}
