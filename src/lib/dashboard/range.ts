/** @deprecated legacy query ?period=7d|30d|90d */
export function parseDashboardPeriod(period: string | null): {
  start: Date;
  end: Date;
} {
  const end = new Date();
  const start = new Date();
  const p = period ?? "30d";
  if (p === "7d") start.setDate(end.getDate() - 7);
  else if (p === "90d") start.setDate(end.getDate() - 90);
  else if (p === "month") start.setMonth(end.getMonth() - 1);
  else start.setDate(end.getDate() - 30);
  return { start, end };
}

export type Period =
  | "today"
  | "week"
  | "month"
  | "quarter"
  | "year"
  | "custom";

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** YYYY-MM-DD в локальной дате */
export function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Диапазон по пресету (конец — конец сегодняшнего дня).
 * week/month/quarter/year — как в ТЗ: сдвиг назад от сегодня.
 */
export function computeRangeForPreset(
  preset: Period,
  customFrom: Date | null,
  customTo: Date | null,
  now = new Date(),
): { start: Date; end: Date } {
  const end = endOfDay(now);

  if (preset === "custom" && customFrom && customTo) {
    if (customFrom > customTo) {
      return { start: startOfDay(customTo), end: endOfDay(customFrom) };
    }
    return { start: startOfDay(customFrom), end: endOfDay(customTo) };
  }

  const start = new Date(now);

  switch (preset) {
    case "today":
      return { start: startOfDay(now), end };
    case "week":
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    case "month":
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    case "quarter":
      start.setDate(start.getDate() - 90);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    case "year":
      start.setDate(start.getDate() - 365);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    default:
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      return { start, end };
  }
}

function getStr(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = sp[key];
  if (Array.isArray(v)) return v[0];
  return v;
}

/** Парсинг для Server Components (searchParams) */
export function parseDashboardDateRange(
  sp: Record<string, string | string[] | undefined>,
): { start: Date; end: Date; preset: Period } {
  const df = getStr(sp, "dateFrom");
  const dt = getStr(sp, "dateTo");
  const presetRaw = (getStr(sp, "preset") ?? "week") as string;

  const validPreset = (p: string): p is Period =>
    ["today", "week", "month", "quarter", "year", "custom"].includes(p);

  if (
    df &&
    dt &&
    /^\d{4}-\d{2}-\d{2}$/.test(df) &&
    /^\d{4}-\d{2}-\d{2}$/.test(dt)
  ) {
    const start = new Date(`${df}T00:00:00`);
    const end = new Date(`${dt}T23:59:59`);
    let preset: Period = validPreset(presetRaw) ? presetRaw : "custom";
    /* Убраны кнопки 30/90/год — старые ссылки показываем как «Свой период» */
    if (preset === "month" || preset === "quarter" || preset === "year") {
      preset = "custom";
    }
    return { start, end, preset };
  }

  const legacy = getStr(sp, "period");
  if (legacy) {
    const { start, end } = parseDashboardPeriod(legacy);
    return { start, end, preset: "custom" };
  }

  const { start, end } = computeRangeForPreset("week", null, null);
  return { start, end, preset: "week" };
}

/** Парсинг для route handlers (URLSearchParams) */
export function parseDashboardRangeFromSearchParams(
  searchParams: URLSearchParams,
): { start: Date; end: Date; preset: Period } {
  const obj: Record<string, string> = {};
  searchParams.forEach((v, k) => {
    if (!obj[k]) obj[k] = v;
  });
  return parseDashboardDateRange({
    period: obj.period,
    preset: obj.preset,
    dateFrom: obj.dateFrom,
    dateTo: obj.dateTo,
  });
}

const fmtRu = new Intl.DateTimeFormat("ru-KZ", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDateRangeSubtitle(
  start: Date,
  end: Date,
  preset: Period,
): string {
  if (preset === "today") {
    return `Сегодня, ${fmtRu.format(end)}`;
  }
  return `${fmtRu.format(start)} — ${fmtRu.format(end)}`;
}
