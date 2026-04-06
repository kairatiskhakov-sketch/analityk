import axios from "axios";

const ADS_API_VERSION = "v16";

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
