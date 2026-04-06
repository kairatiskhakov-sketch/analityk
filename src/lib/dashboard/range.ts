/** period: 7d | 30d | 90d | month (default 30d) */
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
