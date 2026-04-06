/** ?period=7d | 30d | 90d — даты YYYY-MM-DD для GA / Ads stats */
export function parsePeriodToDateRange(period: string | null): {
  from: string;
  to: string;
} {
  const end = new Date();
  const start = new Date();
  const p = period ?? "30d";
  const days =
    p === "7d" ? 7 : p === "90d" || p === "quarter" ? 90 : 30;
  start.setDate(end.getDate() - days);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}
