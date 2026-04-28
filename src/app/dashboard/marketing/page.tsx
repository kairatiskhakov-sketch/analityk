import { redirect } from "next/navigation";
import { MarketingClient } from "./MarketingClient";
import {
  computeRangeForPreset,
  formatDateRangeSubtitle,
  parseDashboardDateRange,
  toYMD,
} from "@/lib/dashboard/range";

export const dynamic = "force-dynamic";

function q(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const df = q(searchParams.dateFrom);
  const dt = q(searchParams.dateTo);
  if (
    !df ||
    !dt ||
    !/^\d{4}-\d{2}-\d{2}$/.test(df) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dt)
  ) {
    const { start, end } = computeRangeForPreset("month", null, null);
    redirect(
      `/dashboard/marketing?preset=month&dateFrom=${toYMD(start)}&dateTo=${toYMD(end)}`,
    );
  }

  const { start, end, preset } = parseDashboardDateRange(searchParams);
  const rangeLabel = formatDateRangeSubtitle(start, end, preset);

  return (
    <MarketingClient
      dateFrom={df}
      dateTo={dt}
      rangeLabel={rangeLabel}
    />
  );
}
