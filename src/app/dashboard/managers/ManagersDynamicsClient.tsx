"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { GroupBy } from "@/lib/dashboard/manager-dynamics";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Card, CardHeader, PageTopBar } from "@/components/ui";
import { ManagerSelect } from "@/components/ui/ManagerSelect";
import { PeriodSelector } from "@/components/ui/PeriodSelector";
import { useModules } from "@/hooks/useModules";
import type { Period } from "@/lib/dashboard/range";

type Mgr = { id: string; name: string };

type DynPayload = {
  groupBy: GroupBy;
  managers: { externalId: string; name: string }[];
  buckets: {
    key: string;
    label: string;
    byManager: Record<
      string,
      { leads: number; deals: number; salesAmount: number; conversion: number }
    >;
  }[];
  lineChart: Record<string, string | number>[];
  table: {
    externalId: string;
    name: string;
    leads: number;
    deals: number;
    salesAmount: number;
    conversion: number;
    trendPct: number | null;
    planTarget: number | null;
    planMet: boolean;
  }[];
  barChart: {
    externalId: string;
    name: string;
    amount: number;
    planMet: boolean;
    planTarget: number | null;
  }[];
};

const LINE_COLORS = [
  "#c8ff00",
  "#4488ff",
  "#ff4444",
  "#ffaa00",
  "#888888",
  "#666666",
  "#44aa88",
  "#aa66cc",
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

export function ManagersDynamicsClient({
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
  const { isEnabled } = useModules();
  const showDynamicsMod = isEnabled("managers_dynamics");
  const showRatingMod = isEnabled("managers_rating");

  const [managers, setManagers] = useState<Mgr[]>([]);
  const [selManagers, setSelManagers] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    const g = sp.get("groupBy");
    return g === "day" || g === "week" || g === "month" ? g : "week";
  });
  const [dyn, setDyn] = useState<DynPayload | null>(null);
  const [ranking, setRanking] = useState<
    { name: string; deals: number; amount: number }[]
  >([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const qDynamics = useMemo(() => {
    const q = new URLSearchParams({
      dateFrom: sp.get("dateFrom") ?? dateFrom,
      dateTo: sp.get("dateTo") ?? dateTo,
      groupBy: sp.get("groupBy") ?? groupBy,
    });
    const mids = sp.get("managerIds");
    if (mids) q.set("managerIds", mids);
    return q.toString();
  }, [dateFrom, dateTo, groupBy, sp]);

  const qManagers = useMemo(() => {
    const q = new URLSearchParams({
      dateFrom: sp.get("dateFrom") ?? dateFrom,
      dateTo: sp.get("dateTo") ?? dateTo,
      preset: sp.get("preset") ?? preset,
    });
    const mids = sp.get("managerIds");
    if (mids) q.set("managerIds", mids);
    return q.toString();
  }, [dateFrom, dateTo, preset, sp]);

  useEffect(() => {
    const m = sp.get("managerIds");
    setSelManagers(m ? m.split(",").filter(Boolean) : []);
    const g = sp.get("groupBy");
    if (g === "day" || g === "week" || g === "month") setGroupBy(g);
  }, [sp]);

  useEffect(() => {
    let c = false;
    fetch("/api/managers/list", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { managers?: Mgr[] }) => {
        if (!c) setManagers(j.managers ?? []);
      })
      .catch(() => {
        if (!c) setManagers([]);
      });
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    if (!showDynamicsMod) {
      setDyn(null);
      setLoadError(null);
      return;
    }
    let c = false;
    setLoadError(null);
    fetch(`/api/managers/dynamics?${qDynamics}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (j: {
          ok?: boolean;
          hasCrm?: boolean;
          data?: DynPayload | null;
          error?: string | null;
        }) => {
          if (c) return;
          if (!j.ok || j.error) {
            setLoadError(j.error ?? "Ошибка загрузки");
            setDyn(null);
            return;
          }
          if (!j.hasCrm || !j.data) {
            setDyn(null);
            return;
          }
          setDyn(j.data);
        },
      )
      .catch((e) => {
        if (!c) {
          setLoadError(e instanceof Error ? e.message : "Ошибка");
          setDyn(null);
        }
      });
    return () => {
      c = true;
    };
  }, [qDynamics, showDynamicsMod]);

  useEffect(() => {
    if (!showRatingMod) {
      setRanking([]);
      return;
    }
    let c = false;
    fetch(`/api/managers?${qManagers}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (j: {
          ok?: boolean;
          ranking?: { name: string; deals: number; amount: number }[];
        }) => {
          if (!c) setRanking(j.ranking ?? []);
        },
      )
      .catch(() => {
        if (!c) setRanking([]);
      });
    return () => {
      c = true;
    };
  }, [qManagers, showRatingMod]);

  const pushFilters = useCallback(
    (overrides?: { managerIds?: string[]; groupBy?: GroupBy }) => {
      const mids = overrides?.managerIds ?? selManagers;
      const gb = overrides?.groupBy ?? groupBy;
      const qs = buildQuery(sp, {
        dateFrom: sp.get("dateFrom") ?? dateFrom,
        dateTo: sp.get("dateTo") ?? dateTo,
        preset: sp.get("preset") ?? preset,
        managerIds: mids.length ? mids.join(",") : undefined,
        groupBy: gb,
      });
      router.push(`/dashboard/managers?${qs}`);
      router.refresh();
    },
    [dateFrom, dateTo, groupBy, preset, router, selManagers, sp],
  );

  const lineKeys = dyn?.managers ?? [];

  const tipLine = (props: {
    active?: boolean;
    payload?: readonly { payload?: unknown }[];
  }) => {
    const { active, payload } = props;
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as Record<string, string | number>;
    const label = String(row.label ?? "");
    const bucketKey = String(row.bucket ?? "");
    const bucket = dyn?.buckets.find((b) => b.key === bucketKey);
    const lines: { name: string; sales: number; deals: number }[] = [];
    for (const m of lineKeys) {
      const k = `sales_${m.externalId}`;
      const sales = Number(row[k] ?? 0);
      if (sales <= 0) continue;
      const deals = bucket?.byManager[m.externalId]?.deals ?? 0;
      lines.push({ name: m.name, sales, deals });
    }
    return (
      <div
        className="rounded-lg border px-3 py-2 text-[11px] shadow-lg"
        style={{
          background: "#1a1a1a",
          borderColor: "#333333",
          color: "#ffffff",
        }}
      >
        <p className="font-medium">{label}</p>
        {lines.map((l) => (
          <p key={l.name}>
            {l.name}: {formatCurrency(l.sales)} ₸ · сделок: {l.deals}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageTopBar
        title="Менеджеры"
        sub={`${rangeLabel} · динамика и рейтинг`}
        right={null}
      />

      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
        <div
          className="flex flex-col gap-3 rounded-[12px] border p-3 lg:flex-row lg:flex-wrap lg:items-end"
          style={{ borderColor: "var(--border)", background: "var(--surface2)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="mb-1 block w-full text-[9.5px] font-medium uppercase tracking-wide lg:mb-0 lg:mr-2 lg:w-auto"
              style={{ color: "var(--hint)" }}
            >
              Период
            </span>
            <PeriodSelector
              basePath="/dashboard/managers"
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

          <div>
            <span
              className="mb-1 block text-[9.5px] font-medium uppercase tracking-wide"
              style={{ color: "var(--hint)" }}
            >
              Группировка
            </span>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["day", "По дням"],
                  ["week", "По неделям"],
                  ["month", "По месяцам"],
                ] as const
              ).map(([id, label]) => {
                const active = groupBy === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setGroupBy(id);
                      pushFilters({ groupBy: id });
                    }}
                    className="rounded-[8px] px-2.5 py-1.5 text-[11.5px] font-semibold transition-all"
                    style={{
                      background: active ? "var(--accent)" : "transparent",
                      color: active ? "#000000" : "var(--muted)",
                      border: active ? "none" : "1px solid var(--border2)",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
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

        {!dyn && !loadError ? (
          <p className="text-[13px]" style={{ color: "var(--hint)" }}>
            Подключите Bitrix24 или подождите загрузку данных.
          </p>
        ) : null}

        {showRatingMod && ranking.length > 0 ? (
          <div
            className="module-enter rounded-[12px] border p-4"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: "var(--muted)" }}
            >
              Рейтинг по сумме продаж (выигранные сделки)
            </p>
            <div className="mt-3 space-y-3">
              {(() => {
                const maxAmt = Math.max(
                  ...ranking.slice(0, 10).map((x) => x.amount),
                  1,
                );
                return ranking.slice(0, 10).map((r, i) => (
                  <div key={r.name} className="space-y-1">
                    <div
                      className="flex justify-between gap-2 text-[13px]"
                      style={{
                        color: i === 0 ? "var(--accent)" : "var(--text)",
                      }}
                    >
                      <span className="font-medium">
                        {i + 1}. {r.name}
                      </span>
                      <span
                        className="shrink-0 tabular-nums"
                        style={{ color: "var(--muted)" }}
                      >
                        {formatCurrency(r.amount)} ₸ · {r.deals} сделок
                      </span>
                    </div>
                    <div
                      className="h-2 overflow-hidden rounded-full"
                      style={{ background: "var(--border)" }}
                    >
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, (r.amount / maxAmt) * 100)}%`,
                          background:
                            i === 0 ? "var(--accent)" : "rgba(200,255,0,0.35)",
                        }}
                      />
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        ) : null}

        {showDynamicsMod && dyn ? (
          <>
            <div className="module-enter grid gap-3 lg:grid-cols-2">
              <Card className="min-h-80 min-w-0">
                <CardHeader title="Динамика продаж" sub="сумма по выигранным сделкам, ₸" />
                <div className="h-72 w-full min-w-0">
                  {dyn.lineChart.length && lineKeys.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dyn.lineChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: "#555555", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: "#555555", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={tipLine} />
                        <Legend />
                        {lineKeys.map((m, i) => (
                          <Line
                            key={m.externalId}
                            type="monotone"
                            dataKey={`sales_${m.externalId}`}
                            name={m.name}
                            stroke={LINE_COLORS[i % LINE_COLORS.length]}
                            dot={false}
                            strokeWidth={2}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="p-4 text-[13px]" style={{ color: "var(--hint)" }}>
                      Нет данных за период
                    </p>
                  )}
                </div>
              </Card>

              <Card className="min-h-80 min-w-0">
                <CardHeader title="Сравнение за период" sub="план — месяц конца периода" />
                <div className="h-72 w-full min-w-0">
                  {dyn.barChart.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dyn.barChart} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                        <XAxis
                          type="number"
                          tick={{ fill: "#555555", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={100}
                          tick={{ fill: "#555555", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          formatter={(v) => [
                            `${formatCurrency(Number(v ?? 0))} ₸`,
                            "Сумма",
                          ]}
                          contentStyle={{
                            background: "#1a1a1a",
                            border: "1px solid #333333",
                            borderRadius: 8,
                            fontSize: 11,
                            color: "#ffffff",
                          }}
                        />
                        <Bar dataKey="amount" name="Сумма" radius={[0, 4, 4, 0]}>
                          {dyn.barChart.map((r) => (
                            <Cell
                              key={r.externalId}
                              fill={
                                r.planTarget != null && r.planTarget > 0
                                  ? r.planMet
                                    ? "var(--accent)"
                                    : "var(--red)"
                                  : "var(--muted)"
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="p-4 text-[13px]" style={{ color: "var(--hint)" }}>
                      Нет данных
                    </p>
                  )}
                </div>
              </Card>
            </div>

            <Card className="module-enter overflow-x-auto">
              <CardHeader title="Сводка" sub="тренд к предыдущему периоду той же длины" />
              <table className="w-full min-w-[640px] border-collapse text-[12px]">
                <thead>
                  <tr
                    className="text-[10px] font-semibold uppercase tracking-wide"
                    style={{ color: "var(--hint)" }}
                  >
                    <th className="py-2 text-left font-medium">Менеджер</th>
                    <th className="py-2 text-right font-medium">Лидов</th>
                    <th className="py-2 text-right font-medium">Сделок</th>
                    <th className="py-2 text-right font-medium">Сумма</th>
                    <th className="py-2 text-right font-medium">Конв.</th>
                    <th className="py-2 text-right font-medium">Тренд</th>
                  </tr>
                </thead>
                <tbody>
                  {dyn.table.map((r) => (
                    <tr
                      key={r.externalId}
                      className="border-t transition-colors hover:bg-[#1a1a1a]"
                      style={{ borderColor: "#1a1a1a", color: "var(--text)" }}
                    >
                      <td className="py-2 pr-2">{r.name}</td>
                      <td className="py-2 text-right">{formatNumber(r.leads)}</td>
                      <td className="py-2 text-right">{formatNumber(r.deals)}</td>
                      <td className="py-2 text-right">{formatCurrency(r.salesAmount)} ₸</td>
                      <td className="py-2 text-right">{r.conversion}%</td>
                      <td
                        className="py-2 text-right font-medium"
                        style={{
                          color:
                            r.trendPct == null
                              ? "var(--muted)"
                              : r.trendPct >= 0
                                ? "var(--green)"
                                : "var(--red)",
                        }}
                      >
                        {r.trendPct == null
                          ? "—"
                          : `${r.trendPct >= 0 ? "↑" : "↓"} ${r.trendPct > 0 ? "+" : ""}${r.trendPct}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        ) : null}

        <Link
          href="/dashboard"
          className="inline-block text-[13px] font-medium"
          style={{ color: "var(--blue)" }}
        >
          ← К дашборду
        </Link>
      </div>
    </div>
  );
}
