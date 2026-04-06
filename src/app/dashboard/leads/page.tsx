import { parseDashboardPeriod } from "@/lib/dashboard/range";
import {
  funnelCounts,
  leadsBySource,
  topFailReasons,
} from "@/lib/dashboard/stats";

export const dynamic = "force-dynamic";

const emptyFunnel = { new: 0, in_progress: 0, won: 0, lost: 0 };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: { period?: string };
}) {
  const period = searchParams.period ?? "30d";
  const { start, end } = parseDashboardPeriod(period);

  let funnel = emptyFunnel;
  let sources: { source: string; count: number }[] = [];
  let fails: { reason: string; count: number }[] = [];
  let dbError: string | null = null;

  try {
    [funnel, sources, fails] = await Promise.all([
      funnelCounts(start, end, null),
      leadsBySource(start, end, null),
      topFailReasons(start, end, null),
    ]);
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-8">
      {dbError ? (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          <strong>База данных недоступна:</strong> {dbError}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Лиды и воронка</h1>
        <div className="flex gap-2 text-sm">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <a
              key={p}
              href={`/dashboard/leads?period=${p}`}
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

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-400">Воронка</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(funnel).map(([k, v]) => (
            <div
              key={k}
              className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2"
            >
              <div className="text-xs text-zinc-500">{k}</div>
              <div className="text-lg font-semibold text-emerald-400">{v}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-medium text-zinc-400">Каналы</h2>
          <ul className="space-y-2 text-sm">
            {sources.length ? (
              sources.map((s) => (
                <li
                  key={s.source}
                  className="flex justify-between border-b border-zinc-800/80 py-1"
                >
                  <span className="text-zinc-300">{s.source}</span>
                  <span className="text-zinc-500">{s.count}</span>
                </li>
              ))
            ) : (
              <li className="text-zinc-500">Нет данных</li>
            )}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-medium text-zinc-400">
            Причины провалов
          </h2>
          <ul className="space-y-2 text-sm">
            {fails.length ? (
              fails.map((f) => (
                <li
                  key={f.reason}
                  className="flex justify-between border-b border-zinc-800/80 py-1"
                >
                  <span className="text-zinc-300">{f.reason}</span>
                  <span className="text-zinc-500">{f.count}</span>
                </li>
              ))
            ) : (
              <li className="text-zinc-500">Нет данных</li>
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
