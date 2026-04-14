import { redirect } from "next/navigation";
import { ManagersDynamicsClient } from "./ManagersDynamicsClient";
import {
  computeRangeForPreset,
  formatDateRangeSubtitle,
  parseDashboardDateRange,
  parseDashboardPeriod,
  toYMD,
} from "@/lib/dashboard/range";

export const dynamic = "force-dynamic";

function q(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ManagersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const df = q(searchParams.dateFrom);
  const dt = q(searchParams.dateTo);
  const legacyPeriod = q(searchParams.period);
  if (
    !df ||
    !dt ||
    !/^\d{4}-\d{2}-\d{2}$/.test(df) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dt)
  ) {
    if (legacyPeriod) {
      const { start, end } = parseDashboardPeriod(legacyPeriod);
      redirect(
        `/dashboard/managers?preset=custom&dateFrom=${toYMD(start)}&dateTo=${toYMD(end)}&groupBy=week`,
      );
    }
    const { start, end } = computeRangeForPreset("week", null, null);
    redirect(
      `/dashboard/managers?preset=week&dateFrom=${toYMD(start)}&dateTo=${toYMD(end)}&groupBy=week`,
    );
  }

  const { start, end, preset } = parseDashboardDateRange(searchParams);
  const rangeLabel = formatDateRangeSubtitle(start, end, preset);

  return (
    <ManagersDynamicsClient
      dateFrom={df}
      dateTo={dt}
      preset={preset}
      rangeLabel={rangeLabel}
    />
  );
}
