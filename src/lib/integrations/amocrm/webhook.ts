import { createHmac, timingSafeEqual } from "crypto";

/**
 * ТЗ: X-Signature = HMAC-SHA1(body, client_secret).
 * Сравнение через timingSafeEqual (если подпись — hex).
 */
export function verifyAmoWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  clientSecret: string,
): boolean {
  if (!signatureHeader?.trim() || !clientSecret) return false;
  const sig = signatureHeader.trim();
  const expectedHex = createHmac("sha1", clientSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  if (/^[0-9a-fA-F]+$/.test(sig) && sig.length === expectedHex.length) {
    try {
      const a = Buffer.from(expectedHex, "hex");
      const b = Buffer.from(sig, "hex");
      if (a.length === b.length) return timingSafeEqual(a, b);
    } catch {
      /* fallthrough */
    }
  }

  return expectedHex === sig;
}

function collectIds(block: unknown): number[] {
  if (!Array.isArray(block)) return [];
  const ids: number[] = [];
  for (const item of block) {
    if (item && typeof item === "object" && "id" in item) {
      const id = Number((item as { id: unknown }).id);
      if (!Number.isNaN(id)) ids.push(id);
    }
  }
  return ids;
}

/**
 * Разбор тела вебхука (add_lead, update_lead, add_contact, update_contact и т.д.).
 */
export function parseAmoWebhookPayload(body: unknown): {
  accountSubdomain?: string;
  leadsAdd: number[];
  leadsUpdate: number[];
  contactsAdd: number[];
  contactsUpdate: number[];
  raw: unknown;
} {
  if (!body || typeof body !== "object") {
    return {
      leadsAdd: [],
      leadsUpdate: [],
      contactsAdd: [],
      contactsUpdate: [],
      raw: body,
    };
  }
  const b = body as Record<string, unknown>;
  const account = b.account as Record<string, unknown> | undefined;
  const leads = b.leads as Record<string, unknown> | undefined;
  const contacts = b.contacts as Record<string, unknown> | undefined;

  return {
    accountSubdomain: account?.subdomain
      ? String(account.subdomain)
      : undefined,
    leadsAdd: collectIds(leads?.add),
    leadsUpdate: collectIds(leads?.update),
    contactsAdd: collectIds(contacts?.add),
    contactsUpdate: collectIds(contacts?.update),
    raw: body,
  };
}
