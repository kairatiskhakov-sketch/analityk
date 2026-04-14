"use client";

import { useMemo, useState } from "react";
import { formatNumber } from "@/lib/utils";
import { useModules } from "@/hooks/useModules";
import {
  Card,
  CardHeader,
  KpiCard,
  MiniBar,
} from "@/components/ui";
import type { FunnelStageRow, FunnelSummary } from "@/lib/dashboard/stats";

type Funnel = { stages: FunnelStageRow[]; summary: FunnelSummary };

function typePrefix(t: FunnelStageRow["analyticsType"]): string {
  switch (t) {
    case "won":
      return "[✅ Продажа]";
    case "lost":
      return "[❌ Провал]";
    case "ignore":
      return "[⏭ Игнор]";
    default:
      return "[🔄 В работе]";
  }
}

function typeColor(t: FunnelStageRow["analyticsType"]): string {
  switch (t) {
    case "won":
      return "var(--accent)";
    case "lost":
      return "var(--red)";
    case "ignore":
      return "var(--hint)";
    default:
      return "var(--blue)";
  }
}

export function LeadsPageClient({
  total,
  funnel,
  sources,
  fails,
  maxSource,
  maxFail,
  dbError,
}: {
  total: number;
  funnel: Funnel;
  sources: { source: string; count: number }[];
  fails: { reason: string; count: number }[];
  maxSource: number;
  maxFail: number;
  dbError: string | null;
}) {
  const { isEnabled } = useModules();
  const [tab, setTab] = useState<"summary" | "funnel">("summary");

  const pipelineGroups = useMemo(() => {
    const m = new Map<string, FunnelStageRow[]>();
    for (const s of funnel.stages) {
      const key = s.pipelineName || "—";
      const arr = m.get(key) ?? [];
      arr.push(s);
      m.set(key, arr);
    }
    return Array.from(m.entries());
  }, [funnel.stages]);

  const maxStageCount = useMemo(
    () =>
      funnel.stages.length
        ? Math.max(...funnel.stages.map((s) => s.count), 1)
        : 1,
    [funnel.stages],
  );

  return (
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

      <div
        className="inline-flex rounded-[10px] p-1"
        style={{ background: "var(--surface2)" }}
      >
        <button
          type="button"
          onClick={() => setTab("summary")}
          className="rounded-[8px] px-3 py-1.5 text-[12px] font-semibold"
          style={{
            background: tab === "summary" ? "var(--accent)" : "transparent",
            color: tab === "summary" ? "#000000" : "var(--muted)",
          }}
        >
          Сводка
        </button>
        <button
          type="button"
          onClick={() => setTab("funnel")}
          className="rounded-[8px] px-3 py-1.5 text-[12px] font-semibold"
          style={{
            background: tab === "funnel" ? "var(--accent)" : "transparent",
            color: tab === "funnel" ? "#000000" : "var(--muted)",
          }}
        >
          Воронка
        </button>
      </div>

      {tab === "summary" ? (
        <>
          {isEnabled("leads_funnel") ? (
            <div className="module-enter grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <KpiCard
                className="delay-1"
                label="Всего лидов"
                value={formatNumber(total)}
                chip={{ text: "за период", type: "neutral" }}
              />
              <KpiCard
                className="delay-2"
                label="В работе + новые"
                value={formatNumber(
                  funnel.summary.new + funnel.summary.in_progress,
                )}
                chip={{ type: "blue", text: "активные" }}
              />
              <KpiCard
                className="delay-3"
                label="Выиграно"
                value={formatNumber(funnel.summary.won)}
                chip={{ type: "up", text: "won" }}
              />
              <KpiCard
                className="delay-4"
                label="Провалов"
                value={formatNumber(funnel.summary.lost)}
                chip={{ type: "down", text: "lost" }}
              />
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            {isEnabled("leads_sources") ? (
              <div className="module-enter">
                <Card>
                  <CardHeader title="Каналы" sub="топ источников" />
                  <div
                    className="divide-y"
                    style={{ borderColor: "var(--border)" }}
                  >
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
                          <MiniBar
                            value={s.count}
                            max={maxSource}
                            color="var(--blue)"
                          />
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
            ) : null}
          </div>

          {isEnabled("leads_fails") ? (
            <div className="module-enter">
              <Card>
                <CardHeader title="Причины провалов" />
                <div
                  className="divide-y"
                  style={{ borderColor: "var(--border)" }}
                >
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
          ) : null}
        </>
      ) : (
        isEnabled("leads_funnel") && (
          <div className="module-enter">
            <Card>
              <CardHeader
                title="Воронка сделок"
                sub="этапы по воронкам Bitrix24 · классификация из настроек"
              />
              <div className="space-y-6">
                {pipelineGroups.length ? (
                  pipelineGroups.map(([pipelineName, rows]) => (
                    <div key={pipelineName}>
                      <p
                        className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em]"
                        style={{ color: "var(--muted)" }}
                      >
                        {pipelineName}
                      </p>
                      <div className="space-y-2">
                        {rows.map((row) => {
                          const pct = Math.round(
                            (row.count / maxStageCount) * 100,
                          );
                          return (
                            <div
                              key={row.id}
                              className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3"
                            >
                              <span
                                className="shrink-0 text-[11px] font-semibold sm:w-[130px]"
                                style={{ color: typeColor(row.analyticsType) }}
                              >
                                {typePrefix(row.analyticsType)}
                              </span>
                              <span
                                className="min-w-0 flex-1 text-[13px]"
                                style={{ color: "var(--text)" }}
                              >
                                {row.name}
                              </span>
                              <div
                                className="flex flex-1 items-center gap-2 sm:max-w-md"
                              >
                                <div
                                  className="h-[24px] min-w-0 flex-1 overflow-hidden rounded-[6px]"
                                  style={{ background: "var(--border)" }}
                                >
                                  <div
                                    className="flex h-full items-center rounded-[6px] px-2"
                                    style={{
                                      width: `${pct}%`,
                                      minWidth: row.count > 0 ? "1.5rem" : 0,
                                      background:
                                        row.analyticsType === "won"
                                          ? "var(--accent)"
                                          : row.analyticsType === "lost"
                                            ? "var(--red)"
                                            : row.analyticsType === "ignore"
                                              ? "var(--surface2)"
                                              : "var(--blue)",
                                    }}
                                  >
                                    <span
                                      className="font-metric text-[11px] font-semibold"
                                      style={{
                                        color:
                                          row.analyticsType === "won"
                                            ? "#000"
                                            : "var(--text)",
                                      }}
                                    >
                                      {formatNumber(row.count)}
                                    </span>
                                  </div>
                                </div>
                                <span
                                  className="shrink-0 tabular-nums text-[12px]"
                                  style={{ color: "var(--muted)" }}
                                >
                                  {row.count} сделок
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[13px]" style={{ color: "var(--hint)" }}>
                    Нет стадий — синхронизируйте Bitrix24 и при необходимости
                    настройте этапы в разделе настроек.
                  </p>
                )}
              </div>
            </Card>
          </div>
        )
      )}
    </div>
  );
}
