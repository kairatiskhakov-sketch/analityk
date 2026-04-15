"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Card, CardHeader, PageTopBar } from "@/components/ui";
import { GlobalFilters } from "@/components/ui/GlobalFilters";
import type { Period } from "@/lib/dashboard/range";

type GroupBy = "day" | "week";
type MetricMode = "amount" | "deals" | "conversion";
type SortKey =
  | "name"
  | "totalLeads"
  | "wonDeals"
  | "totalAmount"
  | "conversion"
  | "avgDeal"
  | "avgCloseDays"
  | "lostDeals"
  | "activeDeals"
  | "trendPct";

const LINE_COLORS = [
  "#7B5CF5",
  "#00E676",
  "#448AFF",
  "#FFD740",
  "#E040FB",
  "#FF5252",
  "#00BCD4",
  "#FF9800",
];

type ManagerStatsRow = {
  id: string;
  externalId: string;
  name: string;
  totalLeads: number;
  wonDeals: number;
  lostDeals: number;
  activeDeals: number;
  totalAmount: number;
  avgDeal: number;
  conversion: number;
  avgCloseDays: number;
  failRate: number;
  topSources: { name: string; count: number }[];
  topFailReasons: { name: string; count: number }[];
  byPipeline: { pipelineId: string; pipelineName: string; deals: number; amount: number }[];
  trendPct: number;
  plan: number | null;
  planProgress: number | null;
};

type StatsPayload = {
  kpi: {
    activeManagers: number;
    bestManager: { name: string; amount: number } | null;
    avgConversion: number;
    avgCloseDays: number;
  } | null;
  managers: ManagerStatsRow[];
  compare: { managerId: string; name: string; current: number; previous: number; changePct: number }[];
};

type DynamicsPayload = {
  managerId: string;
  name: string;
  data: { date: string; amount: number; deals: number }[];
}[];

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return `${p[0][0]}${p[1][0]}`.toUpperCase();
}

function conversionColor(v: number) {
  if (v > 40) return "var(--green)";
  if (v >= 20) return "var(--amber)";
  return "var(--red)";
}

export function ManagersDynamicsClient({
  dateFrom,
  dateTo,
  rangeLabel,
}: {
  dateFrom: string;
  dateTo: string;
  preset: Period;
  rangeLabel: string;
}) {
  const sp = useSearchParams();
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [dynamics, setDynamics] = useState<DynamicsPayload>([]);
  const [compare, setCompare] = useState<StatsPayload["compare"]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const [metricMode, setMetricMode] = useState<MetricMode>("amount");
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("totalAmount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const q = new URLSearchParams({
      dateFrom: sp.get("dateFrom") ?? dateFrom,
      dateTo: sp.get("dateTo") ?? dateTo,
    });
    const mids = sp.get("managers");
    if (mids) q.set("managerIds", mids);
    const pid = sp.get("pipelineId");
    if (pid) q.set("pipelineId", pid);
    return q.toString();
  }, [dateFrom, dateTo, sp]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [sRes, dRes, cRes] = await Promise.all([
          fetch(`/api/managers/stats?${query}`, { cache: "no-store" }),
          fetch(`/api/managers/dynamics?${query}&groupBy=${groupBy}`, { cache: "no-store" }),
          fetch(`/api/managers/compare?${query}`, { cache: "no-store" }),
        ]);
        const sJson = (await sRes.json()) as StatsPayload;
        const dJson = (await dRes.json()) as { data?: DynamicsPayload; error?: string };
        const cJson = (await cRes.json()) as { rows?: StatsPayload["compare"] };
        if (cancelled) return;
        if (!sRes.ok || !dRes.ok || !cRes.ok) throw new Error("Ошибка загрузки");
        setStats(sJson);
        setDynamics(dJson.data ?? []);
        setCompare(cJson.rows ?? sJson.compare ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, groupBy]);

  const barData = useMemo(() => {
    const rows = stats?.managers ?? [];
    return rows.map((m) => ({
      name: m.name,
      value:
        metricMode === "amount"
          ? m.totalAmount
          : metricMode === "deals"
            ? m.wonDeals
            : m.conversion,
      planProgress: m.planProgress,
    }));
  }, [stats, metricMode]);

  const lineData = useMemo(() => {
    const dates = new Set<string>();
    for (const m of dynamics) for (const p of m.data) dates.add(p.date);
    const sorted = Array.from(dates).sort();
    return sorted.map((date) => {
      const row: Record<string, string | number> = { date };
      for (const m of dynamics) {
        row[m.managerId] = m.data.find((x) => x.date === date)?.amount ?? 0;
      }
      return row;
    });
  }, [dynamics]);

  const sortedRows = useMemo(() => {
    const rows = [...(stats?.managers ?? [])];
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const base =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv, "ru")
          : Number(av ?? 0) - Number(bv ?? 0);
      return sortDir === "asc" ? base : -base;
    });
    return rows;
  }, [stats, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageTopBar title="Менеджеры" sub={`${rangeLabel} · аналитика по команде`} right={null} />
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        <GlobalFilters showStages={false} />
        {loading ? <p style={{ color: "var(--hint)" }}>Загрузка...</p> : null}
        {error ? <p style={{ color: "var(--red)" }}>{error}</p> : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card><div className="p-4"><p className="text-[11px]" style={{ color: "var(--hint)" }}>Активных менеджеров</p><p className="mt-1 text-[24px] font-semibold">{formatNumber(stats?.kpi?.activeManagers ?? 0)}</p></div></Card>
          <Card><div className="p-4"><p className="text-[11px]" style={{ color: "var(--hint)" }}>Лучший менеджер</p><p className="mt-1 text-[16px] font-semibold">{stats?.kpi?.bestManager?.name ?? "—"}</p><p className="text-[12px]" style={{ color: "var(--muted)" }}>{formatCurrency(stats?.kpi?.bestManager?.amount ?? 0)} ₸</p></div></Card>
          <Card><div className="p-4"><p className="text-[11px]" style={{ color: "var(--hint)" }}>Средняя конверсия</p><p className="mt-1 text-[24px] font-semibold">{stats?.kpi?.avgConversion ?? 0}%</p></div></Card>
          <Card><div className="p-4"><p className="text-[11px]" style={{ color: "var(--hint)" }}>Среднее время закрытия</p><p className="mt-1 text-[24px] font-semibold">{stats?.kpi?.avgCloseDays ?? 0} дн.</p></div></Card>
        </div>

        <Card>
          <CardHeader title="Сравнительный график" sub="по менеджерам" />
          <div className="flex gap-2 px-4 pb-2">
            {[
              ["amount", "Сумма продаж"],
              ["deals", "Кол-во сделок"],
              ["conversion", "Конверсия %"],
            ].map(([id, label]) => (
              <button key={id} onClick={() => setMetricMode(id as MetricMode)} className="rounded-[8px] px-2 py-1 text-[12px]" style={{ background: metricMode === id ? "var(--purple-bg)" : "transparent", color: metricMode === id ? "var(--purple2)" : "var(--muted)" }}>
                {label}
              </button>
            ))}
          </div>
          <div className="h-80 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {barData.map((r, idx) => {
                    let color = "#7B5CF5";
                    if (r.planProgress != null) color = r.planProgress >= 100 ? "#00E676" : r.planProgress >= 70 ? "#FFD740" : "#FF5252";
                    return <Cell key={`${r.name}-${idx}`} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Динамика по менеджерам" sub="нарастающая сумма продаж" />
          <div className="flex gap-2 px-4 pb-2">
            {[
              ["day", "По дням"],
              ["week", "По неделям"],
            ].map(([id, label]) => (
              <button key={id} onClick={() => setGroupBy(id as GroupBy)} className="rounded-[8px] px-2 py-1 text-[12px]" style={{ background: groupBy === id ? "var(--purple-bg)" : "transparent", color: groupBy === id ? "var(--purple2)" : "var(--muted)" }}>
                {label}
              </button>
            ))}
          </div>
          <div className="h-80 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} />
                <Tooltip />
                <Legend
                  onClick={(e) => {
                    const key = String((e as { dataKey?: string }).dataKey ?? "");
                    if (!key) return;
                    setHiddenSeries((prev) => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    });
                  }}
                />
                {dynamics.map((m, i) => (
                  <Line key={m.managerId} type="monotone" dataKey={m.managerId} name={m.name} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2.5} dot={false} hide={hiddenSeries.has(m.managerId)} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="overflow-x-auto">
          <CardHeader title="Детальная таблица менеджеров" sub="клик по строке раскрывает карточку" />
          <table className="w-full min-w-[1100px] text-[12px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.1em]" style={{ color: "rgba(255,255,255,0.4)" }}>
                <th className="py-2 text-left cursor-pointer" onClick={() => toggleSort("name")}>Менеджер</th>
                <th className="py-2 text-right cursor-pointer" onClick={() => toggleSort("totalLeads")}>Лидов</th>
                <th className="py-2 text-right cursor-pointer" onClick={() => toggleSort("wonDeals")}>Сделок</th>
                <th className="py-2 text-right cursor-pointer" onClick={() => toggleSort("totalAmount")}>Сумма</th>
                <th className="py-2 text-right cursor-pointer" onClick={() => toggleSort("conversion")}>Конверсия</th>
                <th className="py-2 text-right cursor-pointer" onClick={() => toggleSort("avgDeal")}>Средний чек</th>
                <th className="py-2 text-right cursor-pointer" onClick={() => toggleSort("avgCloseDays")}>Ср. время</th>
                <th className="py-2 text-right cursor-pointer" onClick={() => toggleSort("lostDeals")}>Провалов</th>
                <th className="py-2 text-right cursor-pointer" onClick={() => toggleSort("activeDeals")}>В работе</th>
                <th className="py-2 text-right cursor-pointer" onClick={() => toggleSort("trendPct")}>Тренд</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((m) => (
                <>
                  <tr key={m.id} className="cursor-pointer border-t transition-colors hover:bg-[rgba(255,255,255,0.04)]" style={{ borderColor: "rgba(255,255,255,0.05)" }} onClick={() => setExpandedId((x) => (x === m.id ? null : m.id))}>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold" style={{ background: "linear-gradient(135deg,#7B5CF5,#E040FB)", color: "#fff" }}>{initials(m.name)}</span>
                        {m.name}
                      </div>
                    </td>
                    <td className="py-2 text-right">{m.totalLeads}</td>
                    <td className="py-2 text-right">{m.wonDeals}</td>
                    <td className="py-2 text-right">{formatCurrency(m.totalAmount)} ₸</td>
                    <td className="py-2 text-right" style={{ color: conversionColor(m.conversion) }}>{m.conversion}%</td>
                    <td className="py-2 text-right">{formatCurrency(m.avgDeal)} ₸</td>
                    <td className="py-2 text-right">{m.avgCloseDays} дн.</td>
                    <td className="py-2 text-right">{m.lostDeals} ({m.failRate}%)</td>
                    <td className="py-2 text-right">{m.activeDeals}</td>
                    <td className="py-2 text-right" style={{ color: m.trendPct >= 0 ? "var(--green)" : "var(--red)" }}>{m.trendPct >= 0 ? "↑" : "↓"} {Math.abs(m.trendPct)}%</td>
                  </tr>
                  {expandedId === m.id ? (
                    <tr key={`${m.id}-expanded`} className="border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                      <td colSpan={10} className="py-3">
                        <div className="rounded-[12px] border p-4 animate-fade-up" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-semibold" style={{ background: "linear-gradient(135deg,#7B5CF5,#E040FB)", color: "#fff" }}>{initials(m.name)}</span>
                            <div>
                              <p className="font-semibold">{m.name}</p>
                              <p className="text-[11px]" style={{ color: "var(--hint)" }}>Менеджер · ID {m.externalId}</p>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] md:grid-cols-4">
                            <div>Лидов: {m.totalLeads}</div>
                            <div>Сделок: {m.wonDeals}</div>
                            <div>Сумма: {formatCurrency(m.totalAmount)} ₸</div>
                            <div>Конв: {m.conversion}%</div>
                          </div>
                          <div className="mt-3 text-[12px]">
                            <p className="font-medium">Топ источников:</p>
                            <p>{m.topSources.map((x) => `${x.name}: ${x.count}`).join(" · ") || "—"}</p>
                          </div>
                          <div className="mt-2 text-[12px]">
                            <p className="font-medium">Топ причин провалов:</p>
                            <p>{m.topFailReasons.map((x) => `${x.name}: ${x.count}`).join(" · ") || "—"}</p>
                          </div>
                          <div className="mt-2 text-[12px]">
                            <p className="font-medium">По воронкам:</p>
                            {m.byPipeline.map((p) => (
                              <p key={`${m.id}-${p.pipelineId}`}>{p.pipelineName}: {p.deals} сделок · {formatCurrency(p.amount)} ₸</p>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <CardHeader title="Сравнение периодов" sub="текущий vs прошлый аналогичный период" />
          <div className="overflow-x-auto p-3">
            <table className="w-full min-w-[640px] text-[12px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.1em]" style={{ color: "rgba(255,255,255,0.4)" }}>
                  <th className="py-2 text-left">Менеджер</th>
                  <th className="py-2 text-right">Текущий период</th>
                  <th className="py-2 text-right">Прошлый период</th>
                  <th className="py-2 text-right">Изменение</th>
                </tr>
              </thead>
              <tbody>
                {compare.map((r) => (
                  <tr key={r.managerId} className="border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                    <td className="py-2">{r.name}</td>
                    <td className="py-2 text-right">{formatCurrency(r.current)} ₸</td>
                    <td className="py-2 text-right">{formatCurrency(r.previous)} ₸</td>
                    <td className="py-2 text-right" style={{ color: r.changePct >= 0 ? "var(--green)" : "var(--red)" }}>{r.changePct >= 0 ? "↑" : "↓"} {Math.abs(r.changePct)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
