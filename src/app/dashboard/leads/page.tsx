import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  computeRangeForPreset,
  formatDateRangeSubtitle,
  parseDashboardDateRange,
  parseDashboardPeriod,
  toYMD,
} from "@/lib/dashboard/range";
import {
  getPipelineFunnel,
  leadsBySource,
  topFailReasons,
} from "@/lib/dashboard/stats";
import { PageTopBar } from "@/components/ui";
import { PeriodSelector } from "@/components/ui/PeriodSelector";
import { LeadsPageClient } from "./LeadsPageClient";

export const dynamic = "force-dynamic";

const emptyFunnel = {
  stages: [] as Awaited<ReturnType<typeof getPipelineFunnel>>["stages"],
  summary: { total: 0, new: 0, in_progress: 0, won: 0, lost: 0 },
};

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

  let funnel = emptyFunnel;
  let sources: { source: string; count: number }[] = [];
  let fails: { reason: string; count: number }[] = [];
  let dbError: string | null = null;

  try {
    [funnel, sources, fails] = await Promise.all([
      getPipelineFunnel(start, end, null),
      leadsBySource(start, end, null),
      topFailReasons(start, end, null),
    ]);
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  const total = funnel.summary.total;
  const maxSource = sources.length
    ? Math.max(...sources.map((s) => s.count))
    : 1;
  const maxFail = fails.length ? Math.max(...fails.map((f) => f.count)) : 1;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageTopBar
        title="Аналитика лидов"
        sub={`${rangeLabel} · воронка, каналы, провалы`}
        right={
          <Suspense fallback={<div className="h-9 w-48" />}>
            <PeriodSelector
              basePath="/dashboard/leads"
              initialPreset={preset}
              initialDateFrom={toYMD(start)}
              initialDateTo={toYMD(end)}
            />
          </Suspense>
        }
      />

      <LeadsPageClient
        total={total}
        funnel={funnel}
        sources={sources}
        fails={fails}
        maxSource={maxSource}
        maxFail={maxFail}
        dbError={dbError}
      />
    </div>
  );
}
