export type PlanPeriodType = "month" | "quarter" | "year";

export function periodKeyFromDate(d: Date, periodType: PlanPeriodType): string {
  const y = d.getFullYear();
  const m = d.getMonth();
  if (periodType === "year") return String(y);
  if (periodType === "quarter") {
    const q = Math.floor(m / 3) + 1;
    return `${y}-Q${q}`;
  }
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Границы периода в YYYY-MM-DD (локальная дата) для Bitrix-фильтров */
export function getPeriodRange(
  period: string,
  periodType: PlanPeriodType,
): { dateFrom: string; dateTo: string } {
  const { start, end } = parsePeriodToRange(period, periodType);
  return { dateFrom: ymdLocal(start), dateTo: ymdLocal(end) };
}

export function parsePeriodToRange(
  period: string,
  periodType: PlanPeriodType,
): { start: Date; end: Date } {
  if (periodType === "year") {
    const y = parseInt(period, 10);
    if (!Number.isFinite(y)) throw new Error("period");
    return {
      start: new Date(y, 0, 1, 0, 0, 0, 0),
      end: new Date(y, 11, 31, 23, 59, 59, 999),
    };
  }
  if (periodType === "quarter") {
    const m = period.match(/^(\d{4})-Q([1-4])$/);
    if (!m) throw new Error("period");
    const y = parseInt(m[1], 10);
    const q = parseInt(m[2], 10) - 1;
    const startM = q * 3;
    return {
      start: new Date(y, startM, 1, 0, 0, 0, 0),
      end: new Date(y, startM + 3, 0, 23, 59, 59, 999),
    };
  }
  const m2 = period.match(/^(\d{4})-(\d{2})$/);
  if (!m2) throw new Error("period");
  const y = parseInt(m2[1], 10);
  const mo = parseInt(m2[2], 10) - 1;
  return {
    start: new Date(y, mo, 1, 0, 0, 0, 0),
    end: new Date(y, mo + 1, 0, 23, 59, 59, 999),
  };
}

export function daysInRangeInclusive(start: Date, end: Date): number {
  const a = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const b = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

export function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Дней от начала периода до сегодня (включительно), не выходя за end. */
export function elapsedDaysInPeriod(
  start: Date,
  end: Date,
  now: Date = new Date(),
): number {
  const dayStart = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const dayEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cap = today < dayEnd ? today : dayEnd;
  if (cap < dayStart) return 0;
  return Math.round((cap.getTime() - dayStart.getTime()) / 86400000) + 1;
}

const MONTHS_RU = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

export function formatPeriodLabelRu(
  period: string,
  periodType: PlanPeriodType,
): string {
  if (periodType === "year") return `${period} год`;
  if (periodType === "quarter") {
    const m = period.match(/^(\d{4})-Q([1-4])$/);
    if (!m) return period;
    return `${m[1]} · Q${m[2]}`;
  }
  const m2 = period.match(/^(\d{4})-(\d{2})$/);
  if (!m2) return period;
  const y = parseInt(m2[1], 10);
  const mo = parseInt(m2[2], 10) - 1;
  return `${MONTHS_RU[mo] ?? period} ${y}`;
}

/** Список period keys для селекта (назад на n единиц). */
export function listRecentPeriodKeys(
  periodType: PlanPeriodType,
  count: number,
  anchor: Date = new Date(),
): string[] {
  const out: string[] = [];
  if (periodType === "month") {
    const d = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    for (let i = 0; i < count; i++) {
      out.push(periodKeyFromDate(d, "month"));
      d.setMonth(d.getMonth() - 1);
    }
  } else if (periodType === "quarter") {
    const d = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    for (let i = 0; i < count; i++) {
      out.push(periodKeyFromDate(d, "quarter"));
      d.setMonth(d.getMonth() - 3);
    }
  } else {
    let y = anchor.getFullYear();
    for (let i = 0; i < count; i++) {
      out.push(String(y));
      y -= 1;
    }
  }
  return out;
}
