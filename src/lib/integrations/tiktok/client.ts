/**
 * TikTok Marketing API клиент (Business API v1.3).
 * Docs: https://business-api.tiktok.com/portal/docs
 *
 * Авторизация: header `Access-Token: <token>` (не query-параметр).
 * Envelope всех ответов: { code, message, data }.
 */

import { TIKTOK_API_BASE } from "@/lib/integrations/tiktok/oauth";

export type TiktokAdvertiser = {
  advertiser_id: string;
  name?: string;
  currency?: string;
  status?: string;
  timezone?: string;
};

export type TiktokCampaign = {
  campaign_id: string;
  campaign_name: string;
  objective_type?: string;
  /** ACTIVE / DISABLE / ... */
  operation_status?: string;
  /** бюджет в валюте кабинета (уже в единицах валюты). */
  budget?: number;
  budget_mode?: string;
};

export type TiktokReportRow = {
  dimensions?: { campaign_id?: string; stat_time_day?: string };
  metrics?: {
    impressions?: string;
    clicks?: string;
    spend?: string;
    /** Общее число конверсий, используем как «leads» по умолчанию. */
    conversion?: string;
    currency?: string;
  };
};

type Envelope<T> = {
  code: number;
  message: string;
  request_id?: string;
  data: T;
};

type PageInfo = {
  page: number;
  page_size: number;
  total_number: number;
  total_page: number;
};

type ListPayload<T> = { list: T[]; page_info?: PageInfo };

async function tiktokGet<T>(
  path: string,
  accessToken: string,
  query: Record<string, string | string[] | number> = {},
): Promise<T> {
  const url = new URL(`${TIKTOK_API_BASE}${path}`);
  for (const [k, v] of Object.entries(query)) {
    const encoded = Array.isArray(v) ? JSON.stringify(v) : String(v);
    url.searchParams.set(k, encoded);
  }
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { "Access-Token": accessToken },
    cache: "no-store",
  });
  const env = (await res.json()) as Envelope<T> | null;
  if (!res.ok || !env || env.code !== 0) {
    const msg = env?.message ?? `HTTP ${res.status}`;
    throw new Error(`TikTok API: ${msg}`);
  }
  return env.data;
}

async function tiktokGetList<T>(
  path: string,
  accessToken: string,
  query: Record<string, string | string[] | number> = {},
): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  const pageSize = 200;
  let guard = 0;
  while (guard < 50) {
    guard += 1;
    const payload = await tiktokGet<ListPayload<T>>(path, accessToken, {
      ...query,
      page,
      page_size: pageSize,
    });
    out.push(...(payload.list ?? []));
    const totalPage = payload.page_info?.total_page ?? 1;
    if (page >= totalPage) break;
    page += 1;
  }
  return out;
}

/** Имена/валюта/таймзона кабинетов. */
export async function fetchTiktokAdvertisers(
  advertiserIds: string[],
  accessToken: string,
): Promise<TiktokAdvertiser[]> {
  if (!advertiserIds.length) return [];
  const data = await tiktokGet<{ list: TiktokAdvertiser[] }>(
    "/advertiser/info/",
    accessToken,
    { advertiser_ids: advertiserIds },
  );
  return data.list ?? [];
}

/** Кампании кабинета. */
export async function fetchTiktokCampaigns(
  advertiserId: string,
  accessToken: string,
): Promise<TiktokCampaign[]> {
  return tiktokGetList<TiktokCampaign>("/campaign/get/", accessToken, {
    advertiser_id: advertiserId,
  });
}

/** Ежедневные метрики на уровне кампании. */
export async function fetchTiktokReportsDaily(
  advertiserId: string,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<TiktokReportRow[]> {
  return tiktokGetList<TiktokReportRow>(
    "/report/integrated/get/",
    accessToken,
    {
      advertiser_id: advertiserId,
      report_type: "BASIC",
      data_level: "AUCTION_CAMPAIGN",
      dimensions: ["campaign_id", "stat_time_day"],
      metrics: ["impressions", "clicks", "spend", "conversion", "currency"],
      start_date: startDate,
      end_date: endDate,
    },
  );
}
