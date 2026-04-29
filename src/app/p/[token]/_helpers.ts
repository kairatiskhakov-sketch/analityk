import { notFound, redirect } from "next/navigation";
import { loadShareContext } from "@/lib/org/public-share";
import type { ShareSection } from "@/lib/org/public-share-shared";
import {
  computeRangeForPreset,
  parseDashboardDateRange,
  toYMD,
} from "@/lib/dashboard/range";

export function q(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Проверяет токен и доступ к секции, возвращает контекст.
 * Если токен не валиден / выключен / секция не разрешена — 404.
 */
export async function requireShareSection(token: string, section: ShareSection) {
  const ctx = await loadShareContext(token);
  if (!ctx || !ctx.sections.includes(section)) {
    notFound();
  }
  return ctx;
}

/**
 * Если в URL нет dateFrom/dateTo — редиректит на ту же страницу с дефолтным
 * диапазоном (по умолчанию week, marketing — month).
 */
export function ensureDateRange(opts: {
  pathname: string;
  searchParams: Record<string, string | string[] | undefined>;
  defaultPreset?: "week" | "month";
  extraParams?: Record<string, string>;
}): {
  dateFrom: string;
  dateTo: string;
  preset: "today" | "week" | "month" | "quarter" | "year" | "custom";
} {
  const df = q(opts.searchParams.dateFrom);
  const dt = q(opts.searchParams.dateTo);
  if (
    !df ||
    !dt ||
    !/^\d{4}-\d{2}-\d{2}$/.test(df) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dt)
  ) {
    const defPreset = opts.defaultPreset ?? "week";
    const { start, end } = computeRangeForPreset(defPreset, null, null);
    const params = new URLSearchParams({
      preset: defPreset,
      dateFrom: toYMD(start),
      dateTo: toYMD(end),
      ...(opts.extraParams ?? {}),
    });
    redirect(`${opts.pathname}?${params.toString()}`);
  }
  const { preset } = parseDashboardDateRange(opts.searchParams);
  return { dateFrom: df, dateTo: dt, preset };
}
