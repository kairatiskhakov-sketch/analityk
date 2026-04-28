"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardOverview, FunnelApi } from "@/lib/dashboard/overview-stats";
import { periodKeyFromDate } from "@/lib/plan/period";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Card, CardHeader, PageTopBar } from "@/components/ui";
import { GlobalFilters } from "@/components/ui/GlobalFilters";
import type { Period } from "@/lib/dashboard/range";
import { useModules } from "@/hooks/useModules";
import { AdsRoiWidget } from "@/components/dashboard/AdsRoiWidget";
import { HeatmapDayHour } from "@/components/dashboard/HeatmapDayHour";

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
  const { isEnabled } = useModules();
  const sp = useSearchParams();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [funnels, setFunnels] = useState<FunnelApi[]>([]);
  const [series, setSeries] = useState<
    { date: string; leads: number; closed: number; sales: number }[]
  >([]);
  const [managerRank, setManagerRank] = useState<
    { name: string; deals: number; amount: number; trendPct: number }[]
  >([]);
  const [hasCrm, setHasCrm] = useState(true);
  const [openFunnel, setOpenFunnel] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [planSummary, setPlanSummary] = useState<{
    target: number;
    fact: number;
    pct: number;
  } | null>(null);
  const [stageConfigBanner, setStageConfigBanner] = useState(false);
  const [fails, setFails] = useState<{ reason: string; count: number }[]>([]);
  const [failsSource, setFailsSource] = useState<"leads" | "deals" | null>(null);
  const [failsWarning, setFailsWarning] = useState<string | null>(null);
  const [sourceMetric, setSourceMetric] = useState<"count" | "sum">("count");
  const [heatmap, setHeatmap] = useState<{
    leads: number[][];
    deals: number[][];
    leadsTotal: number;
    dealsTotal: number;
  } | null>(null);
  const [heatmapView, setHeatmapView] = useState<"leads" | "deals">("leads");
  const [extraMetrics, setExtraMetrics] = useState<{
    avgCloseDays: number;
    staleLeads: number;
  } | null>(null);

  const qData = useMemo(() => {
    const q = new URLSearchParams({
      dateFrom: sp.get("dateFrom") ?? dateFrom,
      dateTo: sp.get("dateTo") ?? dateTo,
      preset: sp.get("preset") ?? preset,
    });
    const mids = sp.get("managers");
    if (mids) q.set("managers", mids);
    const pid = sp.get("pipelineId");
    if (pid) q.set("pipelineId", pid);
    const stageIds = sp.get("stageIds");
    if (stageIds) q.set("stageIds", stageIds);
    return q.toString();
  }, [dateFrom, dateTo, preset, sp]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError(null);
      try {
        const [oRes, fRes, cRes, mRes, failsRes, hRes, mxRes] = await Promise.all([
          fetch(`/api/dashboard/overview?${qData}`, { cache: "no-store" }),
          fetch(`/api/dashboard/funnels?${qData}`, { cache: "no-store" }),
          fetch(`/api/dashboard/chart?${qData}`, { cache: "no-store" }),
          fetch(`/api/managers?${qData}`, { cache: "no-store" }),
          fetch(`/api/leads/fails?${qData}`, { cache: "no-store" }),
          fetch(`/api/dashboard/heatmap?${qData}`, { cache: "no-store" }),
          fetch(`/api/dashboard/metrics?${qData}`, { cache: "no-store" }),
        ]);
        const oj = (await oRes.json()) as {
          overview?: DashboardOverview | null;
          hasCrm?: boolean;
          error?: string;
        };
        const fj = (await fRes.json()) as { funnels?: FunnelApi[] };
        const cj = (await cRes.json()) as {
          series?: { date: string; leads: number; closed: number; sales: number }[];
        };
        const mj = (await mRes.json()) as {
          ranking?: { name: string; deals: number; amount: number }[];
        };
        const failsJson = (await failsRes.json()) as {
          fails?: { reason: string; count: number }[];
          source?: "leads" | "deals";
          warning?: string;
        };
        const hj = (await hRes.json()) as {
          leads?: number[][];
          deals?: number[][];
          leadsTotal?: number;
          dealsTotal?: number;
        };
        const mxj = (await mxRes.json()) as {
          metrics?: {
            avgCloseDays?: number;
            staleLeads?: number;
          } | null;
        };
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
          setSeries(cj.series ?? []);
          setFails(failsJson.fails ?? []);
          setFailsSource(failsJson.source ?? null);
          setFailsWarning(failsJson.warning ?? null);
          if (hj.leads && hj.deals) {
            setHeatmap({
              leads: hj.leads,
              deals: hj.deals,
              leadsTotal: hj.leadsTotal ?? 0,
              dealsTotal: hj.dealsTotal ?? 0,
            });
          } else {
            setHeatmap(null);
          }
          if (mxj.metrics) {
            setExtraMetrics({
              avgCloseDays: mxj.metrics.avgCloseDays ?? 0,
              staleLeads: mxj.metrics.staleLeads ?? 0,
            });
          } else {
            setExtraMetrics(null);
          }

          const prevParams = new URLSearchParams(qData);
          const curFrom = new Date((sp.get("dateFrom") ?? dateFrom) + "T00:00:00");
          const curTo = new Date((sp.get("dateTo") ?? dateTo) + "T00:00:00");
          const days = Math.max(1, Math.round((curTo.getTime() - curFrom.getTime()) / 86400000) + 1);
          const prevTo = new Date(curFrom);
          prevTo.setDate(prevTo.getDate() - 1);
          const prevFrom = new Date(prevTo);
          prevFrom.setDate(prevFrom.getDate() - days + 1);
          const f = (d: Date) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          prevParams.set("dateFrom", f(prevFrom));
          prevParams.set("dateTo", f(prevTo));
          const prevRes = await fetch(`/api/managers?${prevParams.toString()}`, { cache: "no-store" });
          const prevJson = (await prevRes.json()) as {
            ranking?: { name: string; deals: number; amount: number }[];
          };
          const prevByName = new Map((prevJson.ranking ?? []).map((r) => [r.name, r.amount]));
          setManagerRank(
            (mj.ranking ?? []).slice(0, 5).map((r) => {
              const prev = prevByName.get(r.name) ?? 0;
              const trendPct = prev > 0 ? Math.round(((r.amount - prev) / prev) * 100) : 0;
              return { ...r, trendPct };
            }),
          );
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Ошибка");
          setOverview(null);
          setFunnels([]);
          setSeries([]);
          setManagerRank([]);
          setFails([]);
          setFailsSource(null);
          setFailsWarning(null);
          setHeatmap(null);
          setExtraMetrics(null);
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
    const pipelineId = sp.get("pipelineId");
    const stageIds = sp.get("stageIds");
    const query = new URLSearchParams({
      period,
      periodType: "month",
    });
    if (pipelineId) query.set("pipelineId", pipelineId);
    if (stageIds) query.set("stageIds", stageIds);
    let cancelled = false;
    fetch(`/api/plan/facts?${query.toString()}`, { cache: "no-store" })
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
  }, [sp]);

  const failPie = overview?.failReasons?.length
    ? overview.failReasons.map((x) => ({ name: x.name, value: x.count }))
    : fails.map((x) => ({ name: x.reason, value: x.count }));
  const srcPie =
    overview?.sources?.map((x) => ({
      name: x.name,
      value: sourceMetric === "sum" ? x.sum : x.count,
      count: x.count,
      sum: x.sum,
    })) ?? [];
  const totalLeads = overview?.leads.total ?? 0;
  const totalClosed = overview?.deals.won.count ?? 0;
  const totalSales = overview?.deals.won.sum ?? 0;
  const avgCheck = totalClosed > 0 ? totalSales / totalClosed : 0;
  const totalFailed = overview?.leads.lost ?? 0;
  const failRate = totalLeads > 0 ? Math.round((totalFailed / totalLeads) * 100) : 0;
  const todayLabel = new Date().toISOString().slice(0, 10);
  const leadsToday = series.find((d) => d.date === todayLabel)?.leads ?? 0;
  const prevHalf = Math.max(1, Math.floor(series.length / 2));
  const leadsTrend = series.length
    ? Math.round(
        (((series.slice(-prevHalf).reduce((s, x) => s + x.leads, 0) || 0) -
          (series.slice(0, prevHalf).reduce((s, x) => s + x.leads, 0) || 0)) /
          Math.max(1, series.slice(0, prevHalf).reduce((s, x) => s + x.leads, 0))) *
          100,
      )
    : 0;
  const salesPrev = series.slice(0, prevHalf).reduce((s, x) => s + x.sales, 0);
  const salesNow = series.slice(-prevHalf).reduce((s, x) => s + x.sales, 0);
  const salesTrend = series.length
    ? Math.round((((salesNow || 0) - (salesPrev || 0)) / Math.max(1, salesPrev)) * 100)
    : 0;
  const conversion = totalLeads > 0 ? Math.min(100, Math.round((totalClosed / totalLeads) * 100)) : 0;

  const tipStyle: React.CSSProperties = {
    background: "rgba(26,22,53,0.9)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    fontSize: 11,
    color: "#ffffff"
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageTopBar
        title="Обзор продаж"
        sub={`${rangeLabel} · Saldo CRM`}
        right={null}
      />

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        <GlobalFilters showStages />
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <Card>
                <div className="p-4">
                  <p className="text-[11px]" style={{ color: "var(--hint)" }}>Лидов получено</p>
                  <p className="mt-1 text-[24px] font-semibold">{formatNumber(totalLeads)}</p>
                  <p className="text-[12px]" style={{ color: leadsTrend >= 0 ? "var(--green)" : "var(--red)" }}>
                    {leadsTrend >= 0 ? "▲" : "▼"} {Math.abs(leadsTrend)}%
                  </p>
                </div>
              </Card>
              <Card>
                <div className="p-4">
                  <p className="text-[11px]" style={{ color: "var(--hint)" }}>Сделок закрыто</p>
                  <p className="mt-1 text-[24px] font-semibold">{formatNumber(totalClosed)}</p>
                  <p className="text-[12px]" style={{ color: "var(--muted)" }}>Конверсия {conversion}%</p>
                </div>
              </Card>
              <Card>
                <div className="p-4">
                  <p className="text-[11px]" style={{ color: "var(--hint)" }}>Сумма продаж ₸</p>
                  <p className="mt-1 text-[24px] font-semibold">{formatCurrency(totalSales)}</p>
                  <p className="text-[12px]" style={{ color: salesTrend >= 0 ? "var(--green)" : "var(--red)" }}>
                    {salesTrend >= 0 ? "▲" : "▼"} {Math.abs(salesTrend)}%
                  </p>
                </div>
              </Card>
              <Card>
                <div className="p-4">
                  <p className="text-[11px]" style={{ color: "var(--hint)" }}>Средний чек ₸</p>
                  <p className="mt-1 text-[24px] font-semibold">{formatCurrency(avgCheck)}</p>
                </div>
              </Card>
              <Card>
                <div className="p-4">
                  <p className="text-[11px]" style={{ color: "var(--hint)" }}>В работе</p>
                  <p className="mt-1 text-[24px] font-semibold">{formatNumber(overview.deals.progress.count)}</p>
                  <p className="text-[12px]" style={{ color: "var(--muted)" }}>
                    {formatCurrency(overview.deals.progress.sum)} ₸
                  </p>
                </div>
              </Card>
              <Card>
                <div className="p-4">
                  <p className="text-[11px]" style={{ color: "var(--hint)" }}>Провалено</p>
                  <p className="mt-1 text-[24px] font-semibold">{formatNumber(totalFailed)}</p>
                  <p className="text-[12px]" style={{ color: "var(--muted)" }}>{failRate}% от лидов</p>
                </div>
              </Card>
              {planSummary ? (
                <Card>
                  <div className="p-4">
                    <p className="text-[11px]" style={{ color: "var(--hint)" }}>% выполнения плана</p>
                    <p className="mt-1 text-[24px] font-semibold">{planSummary.pct}%</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${Math.min(100, planSummary.pct)}%`,
                          background: planSummary.pct >= 70 ? "var(--green)" : "var(--red)",
                        }}
                      />
                    </div>
                  </div>
                </Card>
              ) : (
                <Card>
                  <div className="p-4">
                    <p className="text-[11px]" style={{ color: "var(--hint)" }}>% выполнения плана</p>
                    <p className="mt-1 text-[14px]" style={{ color: "var(--muted)" }}>План не задан</p>
                  </div>
                </Card>
              )}
              <Card>
                <div className="p-4">
                  <p className="text-[11px]" style={{ color: "var(--hint)" }}>Новых лидов сегодня</p>
                  <p className="mt-1 text-[24px] font-semibold">{formatNumber(leadsToday)}</p>
                </div>
              </Card>
              <Card>
                <div className="p-4">
                  <p className="text-[11px]" style={{ color: "var(--hint)" }}>Сред. длит. сделки</p>
                  <p className="mt-1 text-[24px] font-semibold">
                    {extraMetrics ? formatNumber(extraMetrics.avgCloseDays) : "—"}
                  </p>
                  <p className="text-[12px]" style={{ color: "var(--muted)" }}>дней от лида до закрытия</p>
                </div>
              </Card>
              <Card>
                <div className="p-4">
                  <p className="text-[11px]" style={{ color: "var(--hint)" }}>Зависшие сделки</p>
                  <p className="mt-1 text-[24px] font-semibold" style={{ color: extraMetrics && extraMetrics.staleLeads > 0 ? "var(--amber)" : "var(--text)" }}>
                    {extraMetrics ? formatNumber(extraMetrics.staleLeads) : "—"}
                  </p>
                  <p className="text-[12px]" style={{ color: "var(--muted)" }}>без движения &gt; 3 дней</p>
                </div>
              </Card>
            </div>

            <Card className="min-h-80">
              <CardHeader title="Динамика по дням" sub="Лиды, закрытые сделки, сумма продаж" />
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={series}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} tickFormatter={(v) => String(v).slice(5)} />
                    <YAxis yAxisId="left" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} />
                    <Tooltip contentStyle={tipStyle} />
                    <Bar yAxisId="right" dataKey="sales" fill="rgba(200,200,200,0.45)" name="Сумма продаж" />
                    <Line yAxisId="left" type="monotone" dataKey="leads" stroke="#4C8DFF" strokeWidth={2.5} dot={false} name="Лиды" />
                    <Line yAxisId="left" type="monotone" dataKey="closed" stroke="#00E676" strokeWidth={2.5} dot={false} name="Сделки закрыто" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="module-enter">
              <div className="flex items-start justify-between gap-3 px-4 pt-4">
                <div>
                  <h3 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                    Активность по дням и часам
                  </h3>
                  <p className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
                    {heatmapView === "leads"
                      ? "когда поступают новые лиды (день недели × час)"
                      : "когда закрываются сделки (день недели × час)"}
                  </p>
                </div>
                <div
                  className="flex items-center gap-1 rounded-[8px] border p-0.5 text-[11px]"
                  style={{ borderColor: "var(--border2)", background: "var(--surface2)" }}
                >
                  {(["leads", "deals"] as const).map((v) => {
                    const active = heatmapView === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setHeatmapView(v)}
                        className="rounded-[6px] px-2 py-1 transition-colors"
                        style={{
                          background: active ? "var(--surface)" : "transparent",
                          color: active ? "var(--text)" : "var(--muted)",
                        }}
                      >
                        {v === "leads" ? "Лиды" : "Сделки"}
                      </button>
                    );
                  })}
                </div>
              </div>
              {heatmap ? (
                <HeatmapDayHour
                  data={heatmapView === "leads" ? heatmap.leads : heatmap.deals}
                  total={heatmapView === "leads" ? heatmap.leadsTotal : heatmap.dealsTotal}
                  emptyHint={
                    heatmapView === "leads"
                      ? "Нет лидов за период"
                      : "Нет закрытых сделок за период"
                  }
                  accent={heatmapView === "leads" ? "#4C8DFF" : "var(--accent)"}
                />
              ) : (
                <p className="px-4 py-8 text-center text-[12px]" style={{ color: "var(--hint)" }}>
                  Загрузка…
                </p>
              )}
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="module-enter min-w-0">
                <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
                  <div>
                    <h3 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                      Источники
                      {srcPie.length > 0 ? (
                        <span style={{ color: "var(--hint)", marginLeft: 6, fontWeight: 400 }}>
                          {sourceMetric === "count"
                            ? `(${formatNumber(srcPie.reduce((s, x) => s + x.count, 0))})`
                            : `(${formatCurrency(srcPie.reduce((s, x) => s + x.sum, 0))} ₸)`}
                        </span>
                      ) : null}
                    </h3>
                    <p className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
                      {sourceMetric === "count" ? "по количеству сделок" : "по сумме продаж"}
                    </p>
                  </div>
                  <div
                    className="flex items-center gap-1 rounded-[8px] border p-0.5 text-[11px]"
                    style={{ borderColor: "var(--border2)", background: "var(--surface2)" }}
                  >
                    {(["count", "sum"] as const).map((v) => {
                      const active = sourceMetric === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setSourceMetric(v)}
                          className="rounded-[6px] px-2 py-1 transition-colors"
                          style={{
                            background: active ? "var(--surface)" : "transparent",
                            color: active ? "var(--text)" : "var(--muted)",
                          }}
                        >
                          {v === "count" ? "Кол-во" : "Сумма"}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-col items-center px-4 pb-4 pt-2">
                  {srcPie.length ? (
                    <>
                      <div className="h-52 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={srcPie}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={52}
                              outerRadius={90}
                            >
                              {srcPie.map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={tipStyle} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2">
                        {srcPie.map((item, idx) => (
                          <div key={item.name} className="flex items-center gap-1.5 text-[12px]">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }}
                            />
                            <span style={{ color: "var(--text)" }}>
                              {item.name}{" "}
                              <span style={{ color: "var(--muted)" }}>
                                {sourceMetric === "sum"
                                  ? `(${formatCurrency(item.sum)} ₸)`
                                  : `(${item.count})`}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="py-8 text-[13px]" style={{ color: "var(--hint)" }}>Нет данных</p>
                  )}
                </div>
              </Card>

              <Card className="module-enter min-w-0">
                <CardHeader
                  title={`Причины отказа (${failPie.reduce((s, x) => s + x.value, 0)})`}
                  sub="из CRM"
                />
                <div className="flex flex-col items-center px-4 pb-4">
                  {failsWarning ? (
                    <div
                      className="mb-3 flex w-full items-center justify-between gap-2 rounded-[10px] border px-3 py-2"
                      style={{ borderColor: "var(--border)", background: "var(--amber-bg)", color: "var(--amber)" }}
                    >
                      <p className="text-[12px]">⚠️ Настройте этапы провала в Настройках</p>
                      <Link href="/dashboard/settings" className="text-[12px] font-semibold underline" style={{ color: "var(--text)" }}>
                        Открыть
                      </Link>
                    </div>
                  ) : null}
                  {failPie.length ? (
                    <>
                      <div className="h-52 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={failPie}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={52}
                              outerRadius={90}
                            >
                              {failPie.map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={tipStyle} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2">
                        {failPie.map((item, idx) => (
                          <div key={item.name} className="flex items-center gap-1.5 text-[12px]">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }}
                            />
                            <span style={{ color: "var(--text)" }}>
                              {item.name} ({item.value})
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2 py-8 text-[13px]" style={{ color: "var(--hint)" }}>
                      <p>Нет данных за период.</p>
                      <p>Попробуйте выбрать 30 дней.</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            <Card>
              <CardHeader title="Рейтинг менеджеров" sub="Топ-5 по сумме продаж" />
              <div className="space-y-2 p-3">
                {managerRank.map((m, idx) => {
                  const topAmount = managerRank[0]?.amount || 1;
                  const pct = Math.round((m.amount / topAmount) * 100);
                  const initials = m.name.split(" ").slice(0, 2).map((x) => x[0]).join("").toUpperCase();
                  return (
                    <div key={m.name} className="rounded-[10px] border p-3" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold" style={{ background: idx === 0 ? "linear-gradient(135deg,#F9D66B,#D4A017)" : "linear-gradient(135deg,#7B5CF5,#E040FB)", color: "#fff" }}>{initials}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="truncate text-[13px]" style={{ color: "var(--text)" }}>{m.name}</span>
                            <span className="text-[13px] font-semibold">{formatCurrency(m.amount)} ₸</span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                            <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: "var(--accent)" }} />
                          </div>
                          <p className="mt-1 text-[11px]" style={{ color: m.trendPct >= 0 ? "var(--green)" : "var(--red)" }}>
                            {m.trendPct >= 0 ? "▲" : "▼"} {Math.abs(m.trendPct)}% · сделок {m.deals}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

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
                                <tr className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: "rgba(255,255,255,0.4)" }}>
                                  <th className="py-1 text-left font-medium">
                                    Стадия
                                  </th>
                                  <th className="py-1 text-right font-medium">
                                    Шт.
                                  </th>
                                  <th className="py-1 text-right font-medium">
                                    Сумма
                                  </th>
                                  <th className="py-1 text-right font-medium">
                                    %
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {f.stages.map((s) => (
                                  <tr key={s.name} className="border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                                    <td className="py-1" style={{ color: "var(--text)" }}>
                                      {s.name}
                                    </td>
                                    <td className="py-1 text-right">
                                      {formatNumber(s.count)}
                                    </td>
                                    <td className="py-1 text-right">
                                      {formatCurrency(s.amount)}
                                    </td>
                                    <td className="py-1 text-right">
                                      {f.totalDeals > 0 ? `${Math.round((s.count / f.totalDeals) * 100)}%` : "0%"}
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

            {isEnabled("ads_roi") ? (
              <AdsRoiWidget
                dateFrom={sp.get("dateFrom") ?? dateFrom}
                dateTo={sp.get("dateTo") ?? dateTo}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
