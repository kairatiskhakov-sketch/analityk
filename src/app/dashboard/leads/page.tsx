import { redirect } from "next/navigation";
import {
  computeRangeForPreset,
  formatDateRangeSubtitle,
  parseDashboardDateRange,
  parseDashboardPeriod,
  toYMD,
} from "@/lib/dashboard/range";
import { PageTopBar } from "@/components/ui";
import { LeadsPageClient } from "./LeadsPageClient";

export const dynamic = "force-dynamic";

function q(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function LeadsPage({
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
        `/dashboard/leads?preset=custom&dateFrom=${toYMD(start)}&dateTo=${toYMD(end)}`,
      );
    }
    const { start, end } = computeRangeForPreset("week", null, null);
    redirect(
      `/dashboard/leads?preset=week&dateFrom=${toYMD(start)}&dateTo=${toYMD(end)}`,
    );
  }

  const { start, end, preset } = parseDashboardDateRange(searchParams);
  const rangeLabel = formatDateRangeSubtitle(start, end, preset);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageTopBar
        title="Аналитика лидов"
        sub={`${rangeLabel} · лиды, динамика, воронка, качество обработки`}
        right={null}
      />
      <LeadsPageClient />
    </div>
  );
}
