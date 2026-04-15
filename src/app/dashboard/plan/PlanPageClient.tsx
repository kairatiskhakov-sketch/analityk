"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageTopBar } from "@/components/ui";
import {
  defaultWonStagesForPipeline,
  PipelineStageSelector,
  type PipelineStageGroup,
} from "@/components/ui/PipelineStageSelector";
import { forecastTeam } from "@/lib/plan/bitrix-facts";
import {
  daysInRangeInclusive,
  formatPeriodLabelRu,
  listRecentPeriodKeys,
  parsePeriodToRange,
  periodKeyFromDate,
  type PlanPeriodType,
} from "@/lib/plan/period";
import { formatCurrency } from "@/lib/utils";
import { fetcher } from "@/lib/swr/fetcher";

type ManagerRow = {
  id: string;
  externalId: string;
  name: string;
  plan: number;
  fact: number;
  pct: number;
  deals?: number;
  trendPct?: number | null;
};

function abbrevName(full: string): string {
  const p = full.trim().split(/\s+/).filter(Boolean);
  if (p.length <= 1) return full;
  return `${p[0]} ${p[1][0]}.`;
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return `${p[0][0] ?? ""}${p[1][0] ?? ""}`.toUpperCase();
}

/** >100 синий (перевыполнение), 70–100 акцент, <70 красный */
function pctColor(pct: number): string {
  if (pct > 100) return "var(--blue)";
  if (pct >= 70) return "var(--accent)";
  return "var(--red)";
}

function pctCell(fact: number, plan: number): { text: string; color: string } {
  if (fact === 0 && plan === 0) {
    return { text: "—", color: "var(--muted)" };
  }
  if (plan <= 0) {
    return { text: "—", color: "var(--muted)" };
  }
  const pct = Math.round((fact / plan) * 100);
  return { text: `${pct}%`, color: pctColor(pct) };
}

function kpiColor(pct: number) {
  if (pct >= 100) return "var(--green)";
  if (pct >= 70) return "var(--accent)";
  return "var(--red)";
}

export function PlanPageClient() {
  const { data: filterOptions } = useSWR<{
    id: string;
    name: string;
    stages: { externalId: string; name: string; type: string; sort: number; color: string }[];
  }[]>("/api/filters/pipelines-with-stages", fetcher);
  const [periodType, setPeriodType] = useState<PlanPeriodType>("month");
  const [period, setPeriod] = useState(() =>
    periodKeyFromDate(new Date(), "month"),
  );
  const [pipelineId, setPipelineId] = useState<string>("");
  const [teamPlan, setTeamPlan] = useState("");
  const [mgrPlans, setMgrPlans] = useState<Record<string, string>>({});
  const [totalFact, setTotalFact] = useState(0);
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [hasCrm, setHasCrm] = useState(true);
  const [chart, setChart] = useState<
    { date: string; fact: number; planLine: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [factsLoading, setFactsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planWarning, setPlanWarning] = useState<string | null>(null);
  const [selectedWonStageIds, setSelectedWonStageIds] = useState<string[]>([]);
  const pipelines = useMemo<PipelineStageGroup[]>(
    () =>
      (filterOptions ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        stages: p.stages,
      })),
    [filterOptions],
  );

  const periodOptions = useMemo(
    () => listRecentPeriodKeys(periodType, 24, new Date()),
    [periodType],
  );

  useEffect(() => {
    setPeriod(periodKeyFromDate(new Date(), periodType));
  }, [periodType]);

  useEffect(() => {
    if (!pipelines.length) return;
    setSelectedWonStageIds(defaultWonStagesForPipeline(pipelines, pipelineId));
  }, [pipelines, pipelineId]);

  const fetchFactsFromBitrix = useCallback(() => {
    setFactsLoading(true);
    setPlanWarning(null);

    const query = new URLSearchParams({
      period,
      periodType,
    });
    if (pipelineId) query.set("pipelineId", pipelineId);
    if (selectedWonStageIds.length) query.set("stageIds", selectedWonStageIds.join(","));
    const url = `/api/plan/facts?${query.toString()}`;
    let factsHttpRes: Response;
    fetch(url, { cache: "no-store" })
      .then((r) => {
        factsHttpRes = r;
        return r.json();
      })
      .then((data) => {
        const fj = data as {
          ok?: boolean;
          totalFact?: number;
          managers?: ManagerRow[];
          warning?: string;
          error?: string;
        };
        if (!factsHttpRes.ok || fj.ok === false) {
          const msg =
            fj.error ?? "Не удалось загрузить факт из Bitrix";
          setPlanWarning(msg);
          return;
        }
        setTotalFact(fj.totalFact ?? 0);
        setManagers(fj.managers ?? []);
        setPlanWarning(typeof fj.warning === "string" ? fj.warning : null);
      })
      .catch(() => {
        setPlanWarning("Не удалось загрузить факт из Bitrix");
      })
      .finally(() => {
        setFactsLoading(false);
      });
  }, [period, periodType, pipelineId, selectedWonStageIds]);

  const load = useCallback(async () => {
    setLoading(true);
    setFactsLoading(true);
    setError(null);
    setPlanWarning(null);
    try {
      const [rPlan, rChart] = await Promise.all([
        fetch(
          `/api/plan?factsOnly=false&period=${encodeURIComponent(period)}&periodType=${periodType}`,
          { cache: "no-store" },
        ),
        (() => {
          const q = new URLSearchParams({ period, periodType });
          if (pipelineId) q.set("pipelineId", pipelineId);
          if (selectedWonStageIds.length) q.set("stageIds", selectedWonStageIds.join(","));
          return fetch(`/api/plan/chart?${q.toString()}`, { cache: "no-store" });
        })(),
      ]);
      const j = (await rPlan.json()) as {
        ok?: boolean;
        period?: string;
        periodType?: PlanPeriodType;
        totalPlan?: number;
        totalFact?: number;
        managers?: ManagerRow[];
        hasCrm?: boolean;
        error?: string;
        warning?: string;
      };
      const cj = (await rChart.json()) as {
        ok?: boolean;
        series?: { date: string; fact: number; planLine: number }[];
      };
      if (!rPlan.ok || j.ok === false) {
        setError(j.error ?? "Ошибка загрузки");
        setPlanWarning(null);
        setFactsLoading(false);
        return;
      }
      setTotalFact(0);
      setManagers(j.managers ?? []);
      setHasCrm(j.hasCrm !== false);
      setTeamPlan(
        j.totalPlan != null && j.totalPlan > 0
          ? String(Math.round(j.totalPlan))
          : "",
      );
      const mp: Record<string, string> = {};
      for (const m of j.managers ?? []) {
        if (m.plan > 0) mp[m.id] = String(Math.round(m.plan));
        else mp[m.id] = "";
      }
      setMgrPlans(mp);
      setChart(cj.series ?? []);
      setLoading(false);

      fetchFactsFromBitrix();
    } catch (e) {
      setPlanWarning(null);
      setError(e instanceof Error ? e.message : "Ошибка");
      setFactsLoading(false);
    } finally {
      setLoading(false);
    }
  }, [period, periodType, pipelineId, selectedWonStageIds, fetchFactsFromBitrix]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetchFactsFromBitrix();
  }, [selectedWonStageIds, fetchFactsFromBitrix]);

  const teamTargetNum = parseFloat(teamPlan.replace(/\s/g, "").replace(",", ".")) || 0;
  const teamFact = totalFact;
  const teamPct = teamTargetNum > 0 ? Math.round((teamFact / teamTargetNum) * 100) : 0;

  const forecast = useMemo(() => {
    try {
      return forecastTeam(
        teamFact,
        teamTargetNum,
        period,
        periodType,
        new Date(),
      );
    } catch {
      return null;
    }
  }, [teamFact, teamTargetNum, period, periodType]);

  const periodLabel = formatPeriodLabelRu(period, periodType);
  const { start: rangeStart, end: rangeEnd } = useMemo(() => {
    try {
      return parsePeriodToRange(period, periodType);
    } catch {
      return { start: new Date(), end: new Date() };
    }
  }, [period, periodType]);
  const totalDays = useMemo(() => daysInRangeInclusive(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const remaining = Math.max(0, teamTargetNum - teamFact);
  const daysPassed = forecast?.daysPassed ?? 1;
  const daysLeft = Math.max(0, totalDays - daysPassed);
  const requiredPace = daysLeft > 0 ? remaining / daysLeft : remaining;

  const chartSeries = useMemo(() => {
    if (!chart.length) return [];
    const lastActualIdx = Math.min(chart.length - 1, Math.max(0, daysPassed - 1));
    const baseFact = chart[lastActualIdx]?.fact ?? teamFact;
    const pace = forecast?.pacePerDay ?? 0;
    return chart.map((point, idx) => ({
      ...point,
      forecastLine:
        idx <= lastActualIdx ? point.fact : Math.max(0, baseFact + pace * (idx - lastActualIdx)),
    }));
  }, [chart, daysPassed, forecast, teamFact]);

  const topManagers = useMemo(
    () => [...managers].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)).slice(0, 3),
    [managers],
  );

  async function savePlan() {
    setSaving(true);
    setError(null);
    try {
      const targetsPayload: { managerId: string | null; target: number }[] =
        [];
      const teamRaw = teamPlan.replace(/\s/g, "").replace(",", ".");
      const team = parseFloat(teamRaw);
      if (Number.isFinite(team) && team > 0) {
        targetsPayload.push({
          managerId: null,
          target: team,
        });
      }
      for (const m of managers) {
        const raw = (mgrPlans[m.id] ?? "").replace(/\s/g, "").replace(",", ".");
        const v = parseFloat(raw);
        if (Number.isFinite(v) && v > 0) {
          targetsPayload.push({
            managerId: m.id,
            target: v,
          });
        }
      }
      const r = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, periodType, targets: targetsPayload }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || j.ok === false) {
        setError(j.error ?? "Не сохранено");
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  const teamPctStyle = pctCell(teamFact, teamTargetNum);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageTopBar
        title="План / Факт продаж"
        sub="План из БД, факт из Bitrix24"
        right={null}
      />

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        <div className="glass flex flex-col flex-wrap gap-3 rounded-[18px] border p-3 lg:flex-row lg:items-end" style={{ borderColor: "var(--border)" }}>
          <div>
            <span
              className="mb-1 block text-[9.5px] font-medium uppercase tracking-[0.1em]"
              style={{ color: "var(--hint)" }}
            >
              Период
            </span>
            <div
              className="flex gap-1 rounded-[10px] p-1"
              style={{ background: "var(--surface2)" }}
            >
              {(["month", "quarter", "year"] as PlanPeriodType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPeriodType(t)}
                  className="rounded-[8px] px-2.5 py-1 text-[12px] font-semibold transition-colors"
                  style={{
                    background: periodType === t ? "linear-gradient(135deg, #7B5CF5, #9B7FF8)" : "transparent",
                    color: periodType === t ? "#ffffff" : "var(--muted)",
                  }}
                >
                  {t === "month" ? "Месяц" : t === "quarter" ? "Квартал" : "Год"}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-[180px]">
            <label
              className="mb-1 block text-[9.5px] font-medium uppercase tracking-wide"
              style={{ color: "var(--hint)" }}
            >
              Выбор
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full rounded-[12px] border px-2 py-2 text-[12px]"
              style={{
                borderColor: "var(--border2)",
                background: "var(--surface)",
                color: "var(--text)",
              }}
            >
              {periodOptions.map((p) => (
                <option key={p} value={p}>
                  {formatPeriodLabelRu(p, periodType)}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[220px]">
            <label className="mb-1 block text-[9.5px] font-medium uppercase tracking-wide" style={{ color: "var(--hint)" }}>
              Воронка
            </label>
            <select
              value={pipelineId}
              onChange={(e) => setPipelineId(e.target.value)}
              className="w-full rounded-[12px] border px-2 py-2 text-[12px]"
              style={{ borderColor: "var(--border2)", background: "var(--surface)", color: "var(--text)" }}
            >
              <option value="">Все воронки</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void savePlan()}
            className="btn-primary rounded-[12px] px-4 py-2 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Сохранение…" : "Сохранить план"}
          </button>
        </div>

        <PipelineStageSelector
          pipelines={pipelines}
          selectedPipelineId={pipelineId}
          selectedStageIds={selectedWonStageIds}
          onPipelineChange={setPipelineId}
          onStageIdsChange={setSelectedWonStageIds}
          allowAllPipelines
        />

        {error ? (
          <p className="text-[13px]" style={{ color: "var(--red)" }}>
            {error}
          </p>
        ) : null}

        {!hasCrm ? (
          <p className="text-[13px]" style={{ color: "var(--hint)" }}>
            Подключите Bitrix24 в настройках — факт подтянется из CRM.
          </p>
        ) : null}

        {planWarning ? (
          <p
            className="rounded-[7px] border px-3 py-2 text-[13px]"
            style={{
              color: "var(--hint)",
              borderColor: "var(--border)",
              background: "var(--surface)",
            }}
          >
            {planWarning}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="glass rounded-[16px] border p-4" style={{ borderColor: "var(--border)" }}>
            <p className="text-[11px]" style={{ color: "var(--hint)" }}>План ₸</p>
            <input
              type="text"
              inputMode="numeric"
              value={teamPlan}
              onChange={(e) => setTeamPlan(e.target.value)}
              className="mt-2 w-full rounded-[10px] border px-3 py-2 font-metric text-[20px] font-semibold"
              style={{ borderColor: "var(--border2)", background: "var(--surface2)", color: "var(--text)" }}
            />
          </div>
          <div className="glass rounded-[16px] border p-4" style={{ borderColor: "var(--border)" }}>
            <p className="text-[11px]" style={{ color: "var(--hint)" }}>Факт ₸</p>
            <p className="mt-2 text-[24px] font-semibold" style={{ color: "var(--text)" }}>
              {factsLoading ? "..." : formatCurrency(teamFact)}
            </p>
          </div>
          <div className="glass rounded-[16px] border p-4" style={{ borderColor: "var(--border)" }}>
            <p className="text-[11px]" style={{ color: "var(--hint)" }}>% выполнения</p>
            <p className="mt-2 text-[24px] font-semibold" style={{ color: kpiColor(teamPct) }}>{teamPctStyle.text}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
              <div className="h-2 rounded-full" style={{ width: `${Math.min(100, teamPct)}%`, background: kpiColor(teamPct) }} />
            </div>
          </div>
          <div className="glass rounded-[16px] border p-4" style={{ borderColor: "var(--border)" }}>
            <p className="text-[11px]" style={{ color: "var(--hint)" }}>Остаток до плана</p>
            <p className="mt-2 text-[22px] font-semibold" style={{ color: "var(--text)" }}>
              {formatCurrency(Math.max(0, remaining))}
            </p>
          </div>
          <div className="glass rounded-[16px] border p-4" style={{ borderColor: "var(--border)" }}>
            <p className="text-[11px]" style={{ color: "var(--hint)" }}>Прогноз</p>
            <p className="mt-2 text-[22px] font-semibold" style={{ color: "var(--text)" }}>
              {formatCurrency(Math.round(forecast?.forecastEnd ?? 0))}
            </p>
          </div>
          <div className="glass rounded-[16px] border p-4" style={{ borderColor: "var(--border)" }}>
            <p className="text-[11px]" style={{ color: "var(--hint)" }}>Нужный темп</p>
            <p className="mt-2 text-[22px] font-semibold" style={{ color: "var(--text)" }}>
              {formatCurrency(Math.round(requiredPace))} / день
            </p>
          </div>
        </div>

        <div className="glass animate-fade-up overflow-x-auto rounded-[18px] border delay-2" style={{ borderColor: "var(--border)" }}>
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <thead>
              <tr
                className="text-[11px] font-semibold uppercase tracking-[0.1em]"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                <th className="px-3 py-2 font-medium">Менеджер</th>
                <th className="px-3 py-2 font-medium">План ₸</th>
                <th className="px-3 py-2 font-medium">Факт ₸</th>
                <th className="px-3 py-2 font-medium">%</th>
                <th className="px-3 py-2 font-medium">Остаток</th>
                <th className="px-3 py-2 font-medium">Тренд</th>
                <th className="px-3 py-2 font-medium">Сделок</th>
              </tr>
            </thead>
            <tbody>
              {managers.map((m) => {
                const raw = mgrPlans[m.id] ?? "";
                const tgt =
                  parseFloat(raw.replace(/\s/g, "").replace(",", ".")) || 0;
                const fact = m.fact;
                const planVal = tgt > 0 ? tgt : m.plan;
                const pc = pctCell(fact, planVal);
                const barPct =
                  planVal > 0 ? Math.round((fact / planVal) * 100) : 0;
                const col = pc.text === "—" ? "var(--muted)" : pc.color;
                return (
                  <tr
                    key={m.id}
                    className="transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                          style={{ background: "linear-gradient(135deg, #7B5CF5, #E040FB)", color: "#ffffff" }}
                        >
                          {initials(m.name)}
                        </span>
                        <span style={{ color: "var(--text)" }}>
                          {abbrevName(m.name)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={mgrPlans[m.id] ?? ""}
                        onChange={(e) =>
                          setMgrPlans((prev) => ({
                            ...prev,
                            [m.id]: e.target.value,
                          }))
                        }
                        className="w-28 rounded-[6px] border px-2 py-1 text-[12px]"
                        style={{
                          borderColor: "var(--border)",
                          background: "var(--surface)",
                          color: "var(--text)",
                        }}
                      />
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--text)" }}>
                      {factsLoading ? (
                        <span
                          className="inline-block h-4 w-24 animate-pulse rounded"
                          style={{ background: "var(--border)" }}
                        />
                      ) : (
                        formatCurrency(fact)
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium" style={{ color: col }}>
                      {factsLoading ? (
                        <span
                          className="inline-block h-4 w-10 animate-pulse rounded"
                          style={{ background: "var(--border)" }}
                        />
                      ) : (
                        pc.text
                      )}
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--text)" }}>
                      {formatCurrency(Math.max(0, planVal - fact))}
                    </td>
                    <td className="px-3 py-2">
                      {m.trendPct == null ? (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      ) : (
                        <span style={{ color: m.trendPct >= 0 ? "var(--green)" : "var(--red)" }}>
                          {m.trendPct >= 0 ? "▲" : "▼"} {Math.abs(m.trendPct)}%
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--text)" }}>
                      {m.deals ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="glass animate-fade-up rounded-[18px] border p-5 delay-3" style={{ borderColor: "var(--border)" }}>
          <p
            className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em]"
            style={{ color: "var(--muted)" }}
          >
            План / Факт / Прогноз ({periodLabel})
          </p>
          <div className="h-72 w-full min-w-0">
            {chartSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="planPurple" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#7B5CF5" />
                      <stop offset="100%" stopColor="#E040FB" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => v.slice(5)}
                  />
                  <YAxis
                    tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(val) =>
                      formatCurrency(typeof val === "number" ? val : Number(val))
                    }
                    contentStyle={{
                      background: "rgba(26,22,53,0.9)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 11,
                      color: "#ffffff",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="fact"
                    name="Факт"
                    stroke="url(#planPurple)"
                    strokeWidth={2.5}
                    dot={{ fill: "#7B5CF5", r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="planLine"
                    name="План (темп)"
                    stroke="#9B7FF8"
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="forecastLine"
                    name="Прогноз"
                    stroke="#00E676"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-[13px]" style={{ color: "var(--hint)" }}>
                Нет данных для графика
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="glass rounded-[16px] border p-4" style={{ borderColor: "var(--border)" }}>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--hint)" }}>
              Топ выполнения
            </p>
            <div className="space-y-2">
              {topManagers.map((m, idx) => (
                <div key={m.id} className="flex items-center justify-between rounded-[10px] px-3 py-2" style={{ background: "var(--surface2)" }}>
                  <span style={{ color: "var(--text)" }}>{idx + 1}. {abbrevName(m.name)}</span>
                  <span style={{ color: kpiColor(m.pct) }}>{m.pct}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="glass rounded-[16px] border p-4" style={{ borderColor: "var(--border)" }}>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--hint)" }}>
              По воронкам
            </p>
            <p className="text-[13px]" style={{ color: "var(--text)" }}>
              Воронка: {(pipelines.find((p) => p.id === pipelineId)?.name ?? "Все воронки")}
            </p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--hint)" }}>
              Этапов в продаже: {selectedWonStageIds.length}
            </p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--hint)" }}>
              Факт за период: {formatCurrency(teamFact)} ₸
            </p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--hint)" }}>
              Период: {rangeStart.toLocaleDateString("ru-RU")} — {rangeEnd.toLocaleDateString("ru-RU")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
