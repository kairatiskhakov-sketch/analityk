/**
 * Единая модель лида для всех CRM (Bitrix24, AmoCRM, …).
 * Соответствует полям Prisma `Lead`, кроме id, connectionId, managerId, syncedAt.
 */
export type CrmType = "bitrix24" | "amocrm";

export type UnifiedLead = {
  externalId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  source: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  managerExternalId?: string | null;
  status: string;
  /** Сырой STATUS_ID CRM (Bitrix и т.д.) — воронка по стадиям */
  stageExternalId?: string | null;
  amount: number;
  failReason?: string | null;
  createdAt: Date;
  closedAt?: Date | null;
};

/** Нормализованные стадии для воронки / дашборда */
export type LeadLifecycle = "new" | "in_progress" | "won" | "lost";

/**
 * Приводит произвольный `status` из CRM к жизненному циклу.
 */
export function leadLifecycle(status: string): LeadLifecycle {
  const s = status.trim().toLowerCase();
  if (s === "won" || s === "converted") return "won";
  if (s === "lost" || s === "junk") return "lost";
  if (s === "new") return "new";
  return "in_progress";
}

/**
 * Обрезка строк, валидация суммы — перед записью в БД или экспортом.
 */
export function normalizeUnifiedLead(lead: UnifiedLead): UnifiedLead {
  return {
    ...lead,
    externalId: lead.externalId.trim(),
    name: (lead.name?.trim() || "Без названия").slice(0, 500),
    source: (lead.source?.trim() || "unknown").slice(0, 255),
    amount: Number.isFinite(lead.amount) ? lead.amount : 0,
    status: lead.status?.trim() || "in_progress",
    phone: lead.phone?.trim() || null,
    email: lead.email?.trim() || null,
    utmSource: lead.utmSource?.trim() || null,
    utmMedium: lead.utmMedium?.trim() || null,
    utmCampaign: lead.utmCampaign?.trim() || null,
    utmContent: lead.utmContent?.trim() || null,
    gclid: lead.gclid?.trim() || null,
    fbclid: lead.fbclid?.trim() || null,
    failReason: lead.failReason?.trim() || null,
    stageExternalId: lead.stageExternalId?.trim() || null,
  };
}

/**
 * Лид, отнесённый к трафику Google (для CPL / связки с Google Ads).
 */
export function isGoogleAttributedLead(lead: UnifiedLead): boolean {
  const u = lead.utmSource?.toLowerCase() ?? "";
  const s = lead.source.toLowerCase();
  if (u.includes("google") || s.includes("google")) return true;
  if (lead.gclid) return true;
  if (s.includes("контекст") && u.includes("google")) return true;
  return false;
}
