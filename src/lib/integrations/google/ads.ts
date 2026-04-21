import axios from "axios";

export const GOOGLE_ADS_API_VERSION = "v18";
const ADS_API_VERSION = GOOGLE_ADS_API_VERSION;

export type GoogleAdsCampaignRow = {
  campaign?: {
    id?: string;
    name?: string;
    status?: string;
  };
  metrics?: {
    impressions?: string;
    clicks?: string;
    costMicros?: string;
    conversions?: string;
  };
};

export type GoogleAdsSearchResponse = {
  results?: GoogleAdsCampaignRow[];
};

function adsHeaders(
  accessToken: string,
  developerToken: string,
  loginCustomerId?: string | null,
): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };
  if (loginCustomerId?.trim()) {
    h["login-customer-id"] = loginCustomerId.replace(/-/g, "");
  }
  return h;
}

/**
 * Список кампаний за последние 30 дней (метрики).
 */
export async function fetchGoogleAdsCampaigns(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId?: string | null,
): Promise<GoogleAdsSearchResponse> {
  const cid = customerId.replace(/-/g, "");
  const url = `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${cid}/googleAds:search`;
  const query = `SELECT campaign.id, campaign.name, campaign.status,
    metrics.impressions, metrics.clicks, metrics.cost_micros,
    metrics.conversions
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS`;

  const { data } = await axios.post<GoogleAdsSearchResponse>(
    url,
    { query },
    { headers: adsHeaders(accessToken, developerToken, loginCustomerId), timeout: 120_000 },
  );
  return data;
}

/**
 * Статистика по ad_group за период (даты YYYY-MM-DD).
 */
export async function fetchGoogleAdsAdGroupStats(
  customerId: string,
  accessToken: string,
  developerToken: string,
  dateFrom: string,
  dateTo: string,
  loginCustomerId?: string | null,
): Promise<GoogleAdsSearchResponse> {
  const cid = customerId.replace(/-/g, "");
  const url = `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${cid}/googleAds:search`;
  const query = `SELECT campaign.name, ad_group.name,
    metrics.clicks, metrics.impressions,
    metrics.cost_micros, metrics.conversions,
    metrics.cost_per_conversion
    FROM ad_group
    WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'`;

  const { data } = await axios.post<GoogleAdsSearchResponse>(
    url,
    { query },
    { headers: adsHeaders(accessToken, developerToken, loginCustomerId), timeout: 120_000 },
  );
  return data;
}

/**
 * Ключевые слова за последние 30 дней.
 */
export async function fetchGoogleAdsKeywords(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId?: string | null,
): Promise<GoogleAdsSearchResponse> {
  const cid = customerId.replace(/-/g, "");
  const url = `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${cid}/googleAds:search`;
  const query = `SELECT ad_group_criterion.keyword.text,
    metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM keyword_view
    WHERE segments.date DURING LAST_30_DAYS`;

  const { data } = await axios.post<GoogleAdsSearchResponse>(
    url,
    { query },
    { headers: adsHeaders(accessToken, developerToken, loginCustomerId), timeout: 120_000 },
  );
  return data;
}

export function microsToCurrency(micros: string | undefined): number {
  if (!micros) return 0;
  const n = parseInt(micros, 10);
  return Number.isNaN(n) ? 0 : n / 1_000_000;
}

// ---------- B4: фичи для AdConnection pipeline ----------

export type GoogleAdsCatalogRow = {
  campaign?: {
    id?: string;
    name?: string;
    status?: string;
    advertisingChannelType?: string;
  };
  campaignBudget?: {
    amountMicros?: string;
  };
};

export type GoogleAdsDailyRow = {
  campaign?: { id?: string; name?: string };
  segments?: { date?: string };
  metrics?: {
    impressions?: string;
    clicks?: string;
    costMicros?: string;
    conversions?: string;
  };
  customer?: { currencyCode?: string };
};

/** Список customer_id, к которым у токена есть доступ (без MCC-иерархии). */
export async function fetchAccessibleCustomers(
  accessToken: string,
  developerToken: string,
): Promise<string[]> {
  const url = `https://googleads.googleapis.com/${ADS_API_VERSION}/customers:listAccessibleCustomers`;
  const { data } = await axios.get<{ resourceNames?: string[] }>(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
    },
    timeout: 60_000,
  });
  return (data.resourceNames ?? []).map((r) => r.replace(/^customers\//, ""));
}

/** Каталог кампаний (для AdCampaign upsert). */
export async function fetchGoogleAdsCampaignsCatalog(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId?: string | null,
): Promise<GoogleAdsCatalogRow[]> {
  const cid = customerId.replace(/-/g, "");
  const url = `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${cid}/googleAds:search`;
  const query = `SELECT campaign.id, campaign.name, campaign.status,
      campaign.advertising_channel_type, campaign_budget.amount_micros
      FROM campaign`;
  const { data } = await axios.post<{ results?: GoogleAdsCatalogRow[] }>(
    url,
    { query },
    { headers: adsHeaders(accessToken, developerToken, loginCustomerId), timeout: 120_000 },
  );
  return data.results ?? [];
}

/** Ежедневные метрики campaign × date в указанном окне (YYYY-MM-DD). */
export async function fetchGoogleAdsDailyInsights(
  customerId: string,
  accessToken: string,
  developerToken: string,
  since: string,
  until: string,
  loginCustomerId?: string | null,
): Promise<GoogleAdsDailyRow[]> {
  const cid = customerId.replace(/-/g, "");
  const url = `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${cid}/googleAds:search`;
  const query = `SELECT campaign.id, campaign.name, segments.date,
      metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions,
      customer.currency_code
      FROM campaign
      WHERE segments.date BETWEEN '${since}' AND '${until}'`;
  const { data } = await axios.post<{ results?: GoogleAdsDailyRow[] }>(
    url,
    { query },
    { headers: adsHeaders(accessToken, developerToken, loginCustomerId), timeout: 120_000 },
  );
  return data.results ?? [];
}
