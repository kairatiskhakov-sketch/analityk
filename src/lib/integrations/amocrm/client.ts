import axios, { type AxiosInstance } from "axios";

export type AmoHttpClient = {
  subdomain: string;
  baseUrl: string;
  raw: AxiosInstance;
  get: <T>(path: string, config?: { params?: Record<string, unknown> }) => Promise<{ data: T; total: number }>;
};

export function normalizeAmoSubdomain(subdomain: string): string {
  return subdomain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\.amocrm\.(ru|com)$/i, "")
    .split("/")[0]!;
}

export function buildAmoApiBaseUrl(subdomain: string): string {
  const s = normalizeAmoSubdomain(subdomain);
  return `https://${s}.amocrm.ru/api/v4`;
}

/**
 * Клиент к amoCRM API v4 с Bearer access_token.
 */
export function createAmoClient(
  subdomain: string,
  accessToken: string,
): AmoHttpClient {
  const s = normalizeAmoSubdomain(subdomain);
  const baseUrl = buildAmoApiBaseUrl(s);
  const raw = axios.create({
    baseURL: baseUrl,
    timeout: 120_000,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    validateStatus: (status) => status >= 200 && status < 300,
  });

  async function get<T>(
    path: string,
    config?: { params?: Record<string, unknown> },
  ): Promise<{ data: T; total: number }> {
    const p = path.startsWith("/") ? path : `/${path}`;
    const res = await raw.get<T>(p, { params: config?.params });
    const totalHeader = res.headers["x-total-count"];
    const total =
      typeof totalHeader === "string"
        ? parseInt(totalHeader, 10)
        : Array.isArray(totalHeader)
          ? parseInt(totalHeader[0] ?? "0", 10)
          : 0;
    return { data: res.data, total: Number.isNaN(total) ? 0 : total };
  }

  return { subdomain: s, baseUrl, raw, get };
}
