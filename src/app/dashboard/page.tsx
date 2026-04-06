import { parseDashboardPeriod } from "@/lib/dashboard/range";
import { getLeadMetricsSafe } from "@/lib/dashboard/safe-stats";
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

  return (
    <div className="space-y-8">
      {dbError ? (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          <strong>База данных недоступна.</strong>{" "}
          <span className="opacity-90">{dbError}</span>
          <p className="mt-2 text-xs text-red-300/80">
            Укажите рабочий <code>DATABASE_URL</code> в <code>.env</code>, затем{" "}
            <code>npx prisma migrate deploy</code> и при необходимости{" "}
            <code>npm run db:seed</code>.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Дашборд</h1>
          <p className="text-sm text-zinc-500">
            Период: {period} · лиды из БД (после синхронизации CRM)
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <a
              key={p}
              href={`/dashboard?period=${p}`}
              className={`rounded-lg px-3 py-1.5 ${
                period === p
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              {p}
            </a>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Лидов", value: m.total },
          { label: "Выиграно", value: m.won },
          { label: "Провалов", value: m.lost },
          {
            label: "Сумма продаж",
            value: `${Math.round(m.salesAmount).toLocaleString("ru-RU")} ₸`,
          },
        ].map((x) => (
          <div
            key={x.label}
            className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
          >
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              {x.label}
            </div>
            <div className="mt-1 text-2xl font-semibold text-emerald-400">
              {x.value}
            </div>
          </div>
        ))}
      </div>

      <DashboardCharts period={period} />
    </div>
  );
}
