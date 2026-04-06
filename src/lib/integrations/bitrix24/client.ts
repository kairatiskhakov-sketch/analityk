import axios, { type AxiosInstance } from "axios";
import type { BitrixRestResponse } from "./types";

/** Результат createBitrix24Client — для типизации methods/sync */
export type Bitrix24HttpClient = {
  baseUrl: string;
  call: <T>(method: string, params?: Record<string, unknown>) => Promise<BitrixRestResponse<T>>;
  raw: AxiosInstance;
};

export type Bitrix24ClientConfig = {
  /** Напр. company.bitrix24.ru (без https) */
  domain: string;
  userId: string;
  webhookToken: string;
};

/**
 * Нормализация домена Bitrix24: company.bitrix24.ru
 */
export function normalizeBitrixDomain(domain: string): string {
  let s = domain.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/\/$/, "");
  if (!s.includes(".") && s.length > 0) {
    s = `${s}.bitrix24.ru`;
  }
  return s;
}

export function buildBitrix24BaseUrl(cfg: Bitrix24ClientConfig): string {
  const host = normalizeBitrixDomain(cfg.domain);
  return `https://${host}/rest/${cfg.userId}/${cfg.webhookToken}/`;
}

/**
 * HTTP-клиент входящего вебхука Bitrix24: POST {method} с JSON-телом.
 */
export function createBitrix24Client(cfg: Bitrix24ClientConfig): Bitrix24HttpClient {
  const baseUrl = buildBitrix24BaseUrl(cfg);
  const raw = axios.create({
    baseURL: baseUrl,
    timeout: 120_000,
    headers: { "Content-Type": "application/json" },
    validateStatus: (s) => s >= 200 && s < 300,
  });

  async function call<T>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<BitrixRestResponse<T>> {
    const path = method.startsWith("/") ? method.slice(1) : method;
    const { data } = await raw.post<BitrixRestResponse<T>>(path, params);
    if (data.error) {
      const msg = [data.error, data.error_description].filter(Boolean).join(": ");
      throw new Error(`Bitrix24 API: ${msg}`);
    }
    return data;
  }

  return { baseUrl, call, raw };
}
