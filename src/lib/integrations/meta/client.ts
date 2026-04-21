/**
 * Meta Marketing API клиент. Работает напрямую через Graph API.
 * Docs: https://developers.facebook.com/docs/marketing-api/insights
 */

import { META_GRAPH_VERSION } from "@/lib/integrations/meta/oauth";

export type MetaAdAccount = {
  id: string; // "act_123"
  account_id?: string;
  name?: string;
  currency?: string;
  account_status?: number;
  business?: { id: string; name?: string };
};

export type MetaCampaign = {
  id: string;
  name: string;
  status?: string;
  objective?: string;
  daily_budget?: string;
};

export type MetaInsightRow = {
  date_start: string;
  date_stop: string;
  campaign_id?: string;
  campaign_name?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  actions?: { action_type: string; value: string }[];
  account_currency?: string;
};

type GraphList<T> = { data: T[]; paging?: { next?: string } };

async function graphGet<T>(
  path: string,
  accessToken: string,
  query: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path}`);
  url.searchParams.set("access_token", accessToken);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  const data = (await res.json()) as unknown;
  if (!res.ok) {
    const msg =
      (data as { error?: { message?: string } } | null)?.error?.message ??
      `HTTP ${res.status}`;
    throw new Error(`Meta API: ${msg}`);
  }
  return data as T;
}

async function graphGetAll<T>(
  path: string,
  accessToken: string,
  query: Record<string, string> = {},
): Promise<T[]> {
  let next: string | undefined;
  const out: T[] = [];
  let page = await graphGet<GraphList<T>>(path, accessToken, query);
  out.push(...page.data);
  next = page.paging?.next;
  let guard = 0;
  while (next && guard < 50) {
    guard += 1;
    const res = await fetch(next, { method: "GET", cache: "no-store" });
    const data = (await res.json()) as unknown;
    if (!res.ok) {
      const msg =
        (data as { error?: { message?: string } } | null)?.error?.message ??
        `HTTP ${res.status}`;
      throw new Error(`Meta API: ${msg}`);
    }
    page = data as GraphList<T>;
    out.push(...page.data);
    next = page.paging?.next;
  }
  return out;
}

/** Список доступных рекламных кабинетов для токена. */
export async function fetchMetaAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  return graphGetAll<MetaAdAccount>("me/adaccounts", accessToken, {
    fields: "id,account_id,name,currency,account_status,business",
  });
}

/** Кампании аккаунта. */
export async function fetchMetaCampaigns(
  accountId: string,
  accessToken: string,
): Promise<MetaCampaign[]> {
  return graphGetAll<MetaCampaign>(`${accountId}/campaigns`, accessToken, {
    fields: "id,name,status,objective,daily_budget",
    limit: "200",
  });
}

/** Ежедневные insights на уровне кампаний. */
export async function fetchMetaInsightsDaily(
  accountId: string,
  accessToken: string,
  since: string,
  until: string,
): Promise<MetaInsightRow[]> {
  return graphGetAll<MetaInsightRow>(`${accountId}/insights`, accessToken, {
    level: "campaign",
    time_increment: "1",
    fields: "campaign_id,campaign_name,impressions,clicks,spend,actions,account_currency",
    time_range: JSON.stringify({ since, until }),
    limit: "500",
  });
}

/** Сумма `actions` с нужным типом (lead, offsite_conversion.fb_pixel_lead и т.п.). */
export function sumLeadActions(row: MetaInsightRow): number {
  if (!row.actions?.length) return 0;
  const LEAD_TYPES = new Set([
    "lead",
    "offsite_conversion.fb_pixel_lead",
    "onsite_conversion.lead_grouped",
  ]);
  let sum = 0;
  for (const a of row.actions) {
    if (LEAD_TYPES.has(a.action_type)) {
      const n = Number(a.value);
      if (!Number.isNaN(n)) sum += n;
    }
  }
  return sum;
}
