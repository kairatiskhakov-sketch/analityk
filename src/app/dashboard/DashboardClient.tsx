"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { DashboardOverview, FunnelApi } from "@/lib/dashboard/overview-stats";
import { periodKeyFromDate } from "@/lib/plan/period";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Card, CardHeader, KpiCard, PageTopBar } from "@/components/ui";
import { ManagerSelect } from "@/components/ui/ManagerSelect";
import { PeriodSelector } from "@/components/ui/PeriodSelector";
import { useModules } from "@/hooks/useModules";
import type { Period } from "@/lib/dashboard/range";

type Mgr = { id: string; name: string };
type Pipe = { id: string; externalId: string; name: string };

const PIE_COLORS = [
  "var(--accent)",
  "var(--blue)",
  "var(--red)",
  "var(--amber)",
  "#888888",
  "#666666",
  "#4488ff",
  "var(--muted)",
];

function buildQuery(
  sp: URLSearchParams,
  overrides: Record<string, string | undefined>,
): string {
  const q = new URLSearchParams(sp.toString());
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined || v === "") q.delete(k);
    else q.set(k, v);
  }
  return q.toString();
}

export function DashboardClient({
  dateFrom,
  dateTo,
  preset,
  rangeLabel,
}: {
  dateFrom: string;
  dateTo: string;
  preset: Period;
  rangeLabel: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const [managers, setManagers] = useState<Mgr[]>([]);
  const [pipelines, setPipelines] = useState<Pipe[]>([]);
  const [selManagers, setSelManagers] = useState<string[]>([]);
  const [selPipeline, setSelPipeline] = useState<string>("");
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [funnels, setFunnels] = useState<FunnelApi[]>([]);
  const [hasCrm, setHasCrm] = useState(true);
  const [openFunnel, setOpenFunnel] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [planSummary, setPlanSummary] = useState<{
    target: number;
    fact: number;
    pct: number;
  } | null>(null);
  const [stageConfigBanner, setStageConfigBanner] = useState(false);

  const { isEnabled } = useModules();

  const qData = useMemo(() => {
    const q = new URLSearchParams({
      dateFrom: sp.get("dateFrom") ?? dateFrom,
      dateTo: sp.get("dateTo") ?? dateTo,
      preset: sp.get("preset") ?? preset,
    });
    const mids = sp.get("managerIds");
    if (mids) q.set("managerIds", mids);
    const pid = sp.get("pipelineId");
    if (pid) q.set("pipelineId", pid);
    return q.toString();
  }, [dateFrom, dateTo, preset, sp]);

  const syncFiltersFromUrl = useCallback(() => {
    const m = sp.get("managerIds");
    setSelManagers(m ? m.split(",").filter(Boolean) : []);
    setSelPipeline(sp.get("pipelineId") ?? "");
  }, [sp]);

  useEffect(() => {
    syncFiltersFromUrl();
  }, [syncFiltersFromUrl]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mRes, pRes] = await Promise.all([
          fetch("/api/managers/list", { cache: "no-store" }),
          fetch("/api/dashboard/pipelines", { cache: "no-store" }),
        ]);
        const mj = (await mRes.json()) as { managers?: Mgr[] };
        const pj = (await pRes.json()) as { pipelines?: Pipe[] };
        if (!cancelled) {
          setManagers(mj.managers ?? []);
          setPipelines(pj.pipelines ?? []);
        }
      } catch {
        if (!cancelled) {
          setManagers([]);
          setPipelines([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError(null);
      try {
        const [oRes, fRes] = await Promise.all([
          fetch(`/api/dashboard/overview?${qData}`, { cache: "no-store" }),
          fetch(`/api/dashboard/funnels?${qData}`, { cache: "no-store" }),
        ]);
        const oj = (await oRes.json()) as {
          overview?: DashboardOverview | null;
          hasCrm?: boolean;
          error?: string;
        };
        const fj = (await fRes.json()) as { funnels?: FunnelApi[] };
        if (!cancelled) {
          if (!oRes.ok) {
            setLoadError(
              oj.error === "CRM недоступна"
                ? "Не удалось загрузить данные из Bitrix24"
                : (oj.error ?? "Ошибка загрузки"),
            );
            setOverview(null);
            setFunnels([]);
            return;
          }
          if (oj.error === "CRM недоступна") {
            setLoadError("Не удалось загрузить данные из Bitrix24");
            setOverview(null);
            setFunnels([]);
            return;
          }
          setHasCrm(oj.hasCrm !== false);
          setOverview(oj.overview ?? null);
          setFunnels(fj.funnels ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Ошибка");
          setOverview(null);
          setFunnels([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qData]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/stages/status", { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (j: { showBanner?: boolean }) => {
          if (!cancelled) setStageConfigBanner(Boolean(j.showBanner));
        },
      )
      .catch(() => {
        if (!cancelled) setStageConfigBanner(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const period = periodKeyFromDate(new Date(), "month");
    let cancelled = false;
    fetch(
      `/api/plan/facts?period=${encodeURIComponent(period)}&periodType=month`,
      { cache: "no-store" },
    )
      .then((r) => r.json())
      .then(
        (data: {
          ok?: boolean;
          totalPlan?: number;
          totalFact?: number;
        }) => {
          if (cancelled || data.ok === false) return;
          const t = data.totalPlan ?? 0;
          const f = data.totalFact ?? 0;
          if (t > 0) {
            setPlanSummary({
              target: t,
              fact: f,
              pct: Math.min(100, Math.round((f / t) * 100)),
            });
          } else setPlanSummary(null);
        },
      )
      .catch(() => setPlanSummary(null));
    return () => {
      cancelled = true;
    };
  }, []);

  function pushFilters(overrides?: { managerIds?: string[] }) {
    const mids = overrides?.managerIds ?? selManagers;
    const qs = buildQuery(sp, {
      dateFrom: sp.get("dateFrom") ?? dateFrom,
      dateTo: sp.get("dateTo") ?? dateTo,
      preset: sp.get("preset") ?? preset,
      managerIds: mids.length ? mids.join(",") : undefined,
      pipelineId: selPipeline || undefined,
    });
    router.push(`/dashboard?${qs}`);
    router.refresh();
  }

  const failPie =
    overview?.failReasons?.map((x) => ({ name: x.name, value: x.count })) ??
    [];
  const srcPie =
    overview?.sources?.map((x) => ({ name: x.name, value: x.count })) ?? [];

  const tipStyle = {
    background: "#1a1a1a",
    border: "1px solid #333333",
    borderRadius: 8,
    fontSize: 11,
    color: "#ffffff",
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageTopBar
        title="Обзор продаж"
        sub={`${rangeLabel} · Saldo CRM`}
        right={null}
      />

      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
        {stageConfigBanner ? (
          <div
            className="flex flex-col gap-2 rounded-[12px] border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            style={{
              borderColor: "var(--border)",
              background: "var(--amber-bg)",
              color: "var(--amber)",
            }}
          >
            <p className="text-[13px] font-medium">
              ⚠️ Этапы воронки не настроены. Аналитика может быть неточной.
            </p>
            <Link
              href="/dashboard/settings"
              className="shrink-0 text-[13px] font-semibold underline"
              style={{ color: "var(--text)" }}
            >
              Настроить →
            </Link>
          </div>
        ) : null}

        <div
          className="flex flex-col gap-3 rounded-[12px] border p-3 lg:flex-row lg:flex-wrap lg:items-end"
          style={{ borderColor: "var(--border)", background: "var(--surface2)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="mb-1 block w-full text-[9.5px] font-medium uppercase tracking-wide lg:mb-0 lg:w-auto lg:mr-2"
              style={{ color: "var(--hint)" }}
            >
              Период
            </span>
            <PeriodSelector
              basePath="/dashboard"
              initialPreset={preset}
              initialDateFrom={dateFrom}
              initialDateTo={dateTo}
            />
          </div>

          <div className="min-w-[200px] flex-1">
            <label
              className="mb-1 block text-[9.5px] font-medium uppercase tracking-wide"
              style={{ color: "var(--hint)" }}
            >
              Менеджеры
            </label>
            <ManagerSelect
              managers={managers}
              selected={selManagers}
              onChange={(ids) => {
                setSelManagers(ids);
                pushFilters({ managerIds: ids });
              }}
            />
          </div>

          <div className="min-w-[160px]">
            <label
              className="mb-1 block text-[9.5px] font-medium uppercase tracking-wide"
              style={{ color: "var(--hint)" }}
            >
              Воронка
            </label>
            <select
              value={selPipeline}
              onChange={(e) => setSelPipeline(e.target.value)}
              className="w-full rounded-[12px] border px-2 py-2 text-[12px]"
              style={{
                borderColor: "var(--border2)",
                background: "var(--surface)",
                color: "var(--text)",
              }}
            >
              <option value="">Все воронки</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.externalId}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => pushFilters()}
            className="rounded-[10px] px-4 py-2 text-[13px] font-semibold transition-opacity hover:opacity-90"
            style={{ background: "var(--accent)", color: "#000000" }}
          >
            Применить
          </button>
        </div>

        {loadError ? (
          <div
            className="rounded-[11px] border px-4 py-3 text-[13px]"
            style={{
              background: "var(--red-bg)",
              borderColor: "var(--border)",
              color: "var(--red)",
            }}
          >
            {loadError}
          </div>
        ) : null}

        {hasCrm && planSummary && isEnabled("plan_progress") ? (
          <div
            className="module-enter rounded-[12px] border px-4 py-3"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--hint)" }}>
              План (текущий месяц)
            </p>
            <p className="mt-1 text-[13px] font-medium" style={{ color: "var(--text)" }}>
              План: {formatCurrency(planSummary.target)} ₸ · Выполнено:{" "}
              {planSummary.pct}%
            </p>
            <div
              className="mt-2 h-2 max-w-md overflow-hidden rounded-full"
              style={{ background: "var(--border)" }}
            >
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, planSummary.pct)}%`,
                  background:
                    planSummary.pct > 100
                      ? "var(--blue)"
                      : planSummary.pct < 70
                        ? "var(--red)"
                        : "var(--accent)",
                }}
              />
            </div>
          </div>
        ) : null}

        {!hasCrm ? (
          <div
            className="flex flex-col gap-2 rounded-[11px] border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
              Подключите CRM для отображения данных
            </p>
            <Link
              href="/dashboard/settings"
              className="inline-flex w-fit shrink-0 text-[13px] font-medium transition-opacity hover:opacity-80"
              style={{ color: "var(--blue)" }}
            >
              Перейти к настройкам →
            </Link>
          </div>
        ) : null}

        {overview && hasCrm ? (
          <>
            {isEnabled("overview_stats") ? (
              <>
                <p
                  className="module-enter text-[12px] leading-snug"
                  style={{ color: "var(--hint)" }}
                >
                  За период:{" "}
                  <span style={{ color: "var(--text)" }}>
                    {formatNumber(overview.general.totalDeals)} сделок
                  </span>
                  {" · "}
                  <span style={{ color: "var(--text)" }}>
                    {formatNumber(overview.general.activePipelines)} активных воронок
                  </span>
                  {" · "}
                  <span style={{ color: "var(--text)" }}>
                    {formatNumber(overview.general.leadsInPeriod)} лидов
                  </span>
                </p>

                <div className="module-enter grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                  <KpiCard
                    className="delay-1"
                    label="Лидов"
                    value={formatNumber(overview.leads.total)}
                    chip={{ text: "всего", type: "neutral" }}
                  />
                  <KpiCard
                    className="delay-2"
                    label="Выиграно (лиды)"
                    value={formatNumber(overview.leads.won)}
                    chip={{ text: "won", type: "up" }}
                  />
                  <KpiCard
                    className="delay-3"
                    label="Проиграно (лиды)"
                    value={formatNumber(overview.leads.lost)}
                    chip={{ text: "lost", type: "down" }}
                  />
                  <KpiCard
                    className="delay-4"
                    label="Сумма (лиды)"
                    value={formatCurrency(overview.leads.salesAmount)}
                    chip={{ text: "won", type: "blue" }}
                  />
                </div>
              </>
            ) : null}

            {isEnabled("financial_stats") ? (
              <div className="module-enter grid grid-cols-1 gap-2.5 md:grid-cols-3">
                <KpiCard
                  className="delay-5"
                  label="В работе (сделки)"
                  value={`${formatNumber(overview.deals.progress.count)} · ${formatCurrency(overview.deals.progress.sum)}`}
                  chip={{ text: "progress", type: "neutral" }}
                />
                <KpiCard
                  className="delay-6"
                  label="Оплачено / выиграно"
                  value={`${formatNumber(overview.deals.won.count)} · ${formatCurrency(overview.deals.won.sum)}`}
                  chip={{ text: "won", type: "up" }}
                />
                <KpiCard
                  className="delay-7"
                  label="Отказ"
                  value={`${formatNumber(overview.deals.lost.count)} · ${formatCurrency(overview.deals.lost.sum)}`}
                  chip={{ text: "lost", type: "down" }}
                />
              </div>
            ) : null}

            <div className="grid gap-3 lg:grid-cols-2">
              {isEnabled("fails_chart") ? (
              <Card className="module-enter min-h-72 min-w-0">
                <CardHeader title="Причины отказа" sub="топ-7 + другое" />
                <div className="h-64 w-full min-w-0">
                  {failPie.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={failPie}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          label={({ name, percent }) =>
                            `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                          }
                        >
                          {failPie.map((_, i) => (
                            <Cell
                              key={i}
                              fill={PIE_COLORS[i % PIE_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tipStyle} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="p-4 text-[13px]" style={{ color: "var(--hint)" }}>
                      За выбранный период отказов нет 👍
                    </p>
                  )}
                </div>
              </Card>
              ) : null}

              {isEnabled("sources_chart") ? (
              <Card className="module-enter min-h-72 min-w-0">
                <CardHeader title="Источники лидов" sub="из CRM" />
                <div className="h-64 w-full min-w-0">
                  {srcPie.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={srcPie}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          label={({ name, percent }) =>
                            `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                          }
                        >
                          {srcPie.map((_, i) => (
                            <Cell
                              key={i}
                              fill={PIE_COLORS[i % PIE_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tipStyle} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="p-4 text-[13px]" style={{ color: "var(--hint)" }}>
                      Нет данных
                    </p>
                  )}
                </div>
              </Card>
              ) : null}
            </div>

            {isEnabled("funnels_detail") ? (
            <Card className="module-enter">
              <CardHeader title="Детализация по воронкам" sub="сделки по стадиям" />
              <div className="space-y-2">
                {funnels.length === 0 ? (
                  <p className="text-[13px]" style={{ color: "var(--hint)" }}>
                    Нет воронок — синхронизируйте Bitrix24.
                  </p>
                ) : (
                  funnels.map((f) => {
                    const open = openFunnel === f.id;
                    return (
                      <div
                        key={f.id}
                        className="rounded-[9px] border"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <button
                          type="button"
                          className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[13px] font-medium"
                          style={{ color: "var(--text)" }}
                          onClick={() =>
                            setOpenFunnel(open ? null : f.id)
                          }
                        >
                          <span>
                            {f.name}{" "}
                            <span style={{ color: "var(--hint)" }}>
                              ({f.totalDeals} сделок)
                            </span>
                          </span>
                          <span style={{ color: "var(--hint)" }}>
                            {open ? "▼" : "▶"}
                          </span>
                        </button>
                        {open ? (
                          <div
                            className="border-t px-3 py-2"
                            style={{ borderColor: "var(--border)" }}
                          >
                            <table className="w-full text-[12px]">
                              <thead>
                                <tr
                                  className="text-[10px] font-semibold uppercase tracking-wide"
                                  style={{ color: "var(--hint)" }}
                                >
                                  <th className="py-1 text-left font-medium">
                                    Стадия
                                  </th>
                                  <th className="py-1 text-right font-medium">
                                    Шт.
                                  </th>
                                  <th className="py-1 text-right font-medium">
                                    Сумма
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {f.stages.map((s) => (
                                  <tr key={s.name}>
                                    <td className="py-1" style={{ color: "var(--text)" }}>
                                      {s.name}
                                    </td>
                                    <td className="py-1 text-right">
                                      {formatNumber(s.count)}
                                    </td>
                                    <td className="py-1 text-right">
                                      {formatCurrency(s.amount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
