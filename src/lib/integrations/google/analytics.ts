import axios from "axios";

function normalizePropertyId(propertyId: string): string {
  return propertyId.replace(/^properties\//, "").trim();
}

/**
 * Трафик по источникам / медиум (GA4 Data API v1beta).
 */
export async function runTrafficBySourceMedium(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<unknown> {
  const pid = normalizePropertyId(propertyId);
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${pid}:runReport`;
  const { data } = await axios.post(
    url,
    {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "conversions" },
        { name: "bounceRate" },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 120_000,
    },
  );
  return data;
}

export async function runConversionsByFirstUserSource(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<unknown> {
  const pid = normalizePropertyId(propertyId);
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${pid}:runReport`;
  const { data } = await axios.post(
    url,
    {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "firstUserSource" }],
      metrics: [{ name: "conversions" }, { name: "totalUsers" }],
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 120_000,
    },
  );
  return data;
}

export async function runTopConvertingPages(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<unknown> {
  const pid = normalizePropertyId(propertyId);
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${pid}:runReport`;
  const { data } = await axios.post(
    url,
    {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "conversions" }, { name: "sessions" }],
      limit: 50,
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 120_000,
    },
  );
  return data;
}
