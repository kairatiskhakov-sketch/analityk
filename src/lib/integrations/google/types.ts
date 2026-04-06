/** Период для отчётов: last_30_days или даты */
export type GoogleReportPeriod =
  | { kind: "last_30_days" }
  | { kind: "range"; from: string; to: string };
