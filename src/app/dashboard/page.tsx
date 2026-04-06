import { parseDashboardPeriod } from "@/lib/dashboard/range";
import { getLeadMetricsSafe } from "@/lib/dashboard/safe-stats";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  KpiCard,
  PageTopBar,
  PeriodRangeLinks,
} from "@/components/ui";
import { DashboardCharts } from "./DashboardCharts";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { period?: string };
}) {
  const period = searchParams.period ?? "30d";
  const { start, end } = parseDashboardPeriod(period);
  const { metrics: m, dbError } = await getLeadMetricsSafe(start, end, null);

  const convPct =
    m.total > 0 ? Math.round((m.won / m.total) * 100) : 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageTopBar
        title="Обзор продаж"
        sub={`Период ${period} · данные из БД после синхронизации CRM`}
        right={<PeriodRangeLinks hrefPrefix="/dashboard" period={period} />}
      />

      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
        {dbError ? (
          <div
            className="rounded-[11px] border px-4 py-3 text-[13px]"
            style={{
              background: "var(--red-bg)",
              borderColor: "var(--border)",
              color: "var(--red)",
            }}
          >
            <strong>База данных недоступна.</strong>{" "}
            <span className="opacity-90">{dbError}</span>
            <p className="mt-2 text-[11px] opacity-80">
              Укажите рабочий <code>DATABASE_URL</code> в <code>.env</code>, затем{" "}
              <code>npx prisma migrate deploy</code> и при необходимости{" "}
              <code>npm run db:seed</code>.
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <KpiCard
            label="Лидов"
            value={formatNumber(m.total)}
            chip={{ text: "всего за период", type: "neutral" }}
            className="delay-1"
          />
          <KpiCard
            label="Выиграно"
            value={formatNumber(m.won)}
            chip={{ text: `конв. ${convPct}%`, type: "up" }}
            className="delay-2"
          />
          <KpiCard
            label="Провалов"
            value={formatNumber(m.lost)}
            chip={{ text: "lost", type: "down" }}
            className="delay-3"
          />
          <KpiCard
            label="Сумма продаж"
            value={formatCurrency(m.salesAmount)}
            chip={{ text: "won deals", type: "blue" }}
            className="delay-4"
          />
        </div>

        <DashboardCharts period={period} />
      </div>
    </div>
  );
}
