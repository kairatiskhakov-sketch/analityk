import { parseDashboardPeriod } from "@/lib/dashboard/range";
import {
  funnelCounts,
  leadsBySource,
  topFailReasons,
} from "@/lib/dashboard/stats";
import { formatNumber } from "@/lib/utils";
import {
  Card,
  CardHeader,
  KpiCard,
  MiniBar,
  PageTopBar,
  PeriodRangeLinks,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const emptyFunnel = { new: 0, in_progress: 0, won: 0, lost: 0 };

const FUNNEL_LABELS: Record<string, string> = {
  new: "Новые",
  in_progress: "В работе",
  won: "Выиграно",
  lost: "Провал",
};

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

  const total =
    funnel.new + funnel.in_progress + funnel.won + funnel.lost;
  const maxFunnel = Math.max(
    funnel.new,
    funnel.in_progress,
    funnel.won,
    funnel.lost,
    1,
  );
  const maxSource = sources.length
    ? Math.max(...sources.map((s) => s.count))
    : 1;
  const maxFail = fails.length ? Math.max(...fails.map((f) => f.count)) : 1;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageTopBar
        title="Аналитика лидов"
        sub="воронка, каналы, провалы"
        right={<PeriodRangeLinks hrefPrefix="/dashboard/leads" period={period} />}
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
            <strong>База данных недоступна:</strong> {dbError}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <KpiCard
            label="Всего лидов"
            value={formatNumber(total)}
            chip={{ text: "за период", type: "neutral" }}
          />
          <KpiCard
            label="В работе + новые"
            value={formatNumber(funnel.new + funnel.in_progress)}
            chip={{ type: "blue", text: "активные" }}
          />
          <KpiCard
            label="Выиграно"
            value={formatNumber(funnel.won)}
            chip={{ type: "up", text: "won" }}
          />
          <KpiCard
            label="Провалов"
            value={formatNumber(funnel.lost)}
            chip={{ type: "down", text: "lost" }}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader title="Воронка" sub="по статусам" />
            <div className="space-y-2">
              {(
                Object.entries(funnel) as [
                  keyof typeof funnel,
                  number,
                ][]
              ).map(([k, v]) => {
                const pct = Math.round((v / maxFunnel) * 100);
                return (
                  <div key={k} className="flex items-center gap-2.5">
                    <span
                      className="w-[100px] flex-shrink-0 text-right text-[11px]"
                      style={{ color: "var(--muted)" }}
                    >
                      {FUNNEL_LABELS[k] ?? k}
                    </span>
                    <div
                      className="h-[28px] flex-1 overflow-hidden rounded-[5px]"
                      style={{ background: "var(--surface2)" }}
                    >
                      <div
                        className="flex h-full items-center rounded-[5px] px-2 transition-all"
                        style={{
                          width: `${pct}%`,
                          minWidth: v > 0 ? "2rem" : 0,
                          background: "rgba(28,27,24,0.12)",
                        }}
                      >
                        <span
                          className="text-[11.5px] font-medium"
                          style={{ color: "var(--text)" }}
                        >
                          {formatNumber(v)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader title="Каналы" sub="топ источников" />
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {sources.length ? (
                sources.map((s) => (
                  <div
                    key={s.source}
                    className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0"
                  >
                    <span
                      className="flex-1 text-[12.5px]"
                      style={{ color: "var(--text)" }}
                    >
                      {s.source}
                    </span>
                    <MiniBar value={s.count} max={maxSource} color="var(--blue)" />
                    <span
                      className="min-w-[40px] text-right text-[11.5px]"
                      style={{ color: "var(--muted)" }}
                    >
                      {s.count}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-[13px]" style={{ color: "var(--hint)" }}>
                  Нет данных
                </p>
              )}
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader title="Причины провалов" />
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {fails.length ? (
              fails.map((f) => (
                <div
                  key={f.reason}
                  className="flex items-center gap-2.5 py-2.5 first:pt-0 last:pb-0"
                >
                  <span
                    className="min-w-0 flex-1 text-[12px]"
                    style={{ color: "var(--text)" }}
                  >
                    {f.reason}
                  </span>
                  <div
                    className="h-[3px] flex-1 rounded-full"
                    style={{ background: "var(--border)" }}
                  >
                    <div
                      className="h-[3px] rounded-full"
                      style={{
                        width: `${Math.round((f.count / maxFail) * 100)}%`,
                        background: "var(--red)",
                      }}
                    />
                  </div>
                  <span
                    className="w-8 text-right text-[11px]"
                    style={{ color: "var(--muted)" }}
                  >
                    {f.count}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-[13px]" style={{ color: "var(--hint)" }}>
                Нет данных
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
