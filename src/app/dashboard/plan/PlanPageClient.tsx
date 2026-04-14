"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageTopBar } from "@/components/ui";
import { forecastTeam } from "@/lib/plan/bitrix-facts";
import {
  formatPeriodLabelRu,
  listRecentPeriodKeys,
  periodKeyFromDate,
  parsePeriodToRange,
  type PlanPeriodType,
} from "@/lib/plan/period";
import { formatCurrency } from "@/lib/utils";

type ManagerRow = {
  id: string;
  externalId: string;
  name: string;
  plan: number;
  fact: number;
  pct: number;
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

export function PlanPageClient() {
  const [periodType, setPeriodType] = useState<PlanPeriodType>("month");
  const [period, setPeriod] = useState(() =>
    periodKeyFromDate(new Date(), "month"),
  );
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
  const [factsElapsedSec, setFactsElapsedSec] = useState(0);
  const factsAbortRef = useRef<AbortController | null>(null);

  const periodOptions = useMemo(
    () => listRecentPeriodKeys(periodType, 24, new Date()),
    [periodType],
  );

  useEffect(() => {
    setPeriod(periodKeyFromDate(new Date(), periodType));
  }, [periodType]);

  useEffect(() => {
    if (!factsLoading) {
      setFactsElapsedSec(0);
      return;
    }
    const id = setInterval(() => {
      setFactsElapsedSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [factsLoading]);

  const fetchFactsFromBitrix = useCallback(() => {
    console.log("Fetching facts for:", period, periodType);
    factsAbortRef.current?.abort();
    const ac = new AbortController();
    factsAbortRef.current = ac;
    setFactsElapsedSec(0);
    setFactsLoading(true);
    setPlanWarning(null);

    const url = `/api/plan/facts?period=${encodeURIComponent(period)}&periodType=${periodType}`;
    let factsHttpRes: Response;
    fetch(url, { cache: "no-store", signal: ac.signal })
      .then((r) => {
        factsHttpRes = r;
        return r.json();
      })
      .then((data) => {
        console.log("Facts received:", data);
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
      .catch((err) => {
        console.error("Facts error:", err);
        if (err instanceof DOMException && err.name === "AbortError") return;
        setPlanWarning("Не удалось загрузить факт из Bitrix");
      })
      .finally(() => {
        setFactsLoading(false);
      });
  }, [period, periodType]);

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
        fetch(
          `/api/plan/chart?period=${encodeURIComponent(period)}&periodType=${periodType}`,
          { cache: "no-store" },
        ),
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
  }, [period, periodType, fetchFactsFromBitrix]);

  useEffect(() => {
    void load();
  }, [load]);

  const teamTargetNum =
    parseFloat(teamPlan.replace(/\s/g, "").replace(",", ".")) || 0;
  const teamFact = totalFact;
  const teamPct =
    teamTargetNum > 0 ? Math.round((teamFact / teamTargetNum) * 100) : 0;

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

  const forecastText = useMemo(() => {
    if (!forecast || teamTargetNum <= 0) return null;
    if (forecast.message === "done") {
      return "🎉 План уже выполнен!";
    }
    if (forecast.message === "on_track") {
      return "✅ При текущем темпе выполните план";
    }
    if (forecast.message === "behind" && forecast.neededPerDay != null) {
      return `⚠️ Отстаёте — нужно ${formatCurrency(Math.round(forecast.neededPerDay))} ₸/день для выполнения`;
    }
    return null;
  }, [forecast, teamTargetNum, period, periodType]);

  const teamPctStyle = pctCell(teamFact, teamTargetNum);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageTopBar
        title="План / Факт продаж"
        sub="Цели команды и менеджеров · факт из Bitrix24"
        right={null}
      />

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        <div
          className="flex flex-col flex-wrap gap-3 rounded-[12px] border p-3 lg:flex-row lg:items-end"
          style={{ borderColor: "var(--border)", background: "var(--surface2)" }}
        >
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
                    background:
                      periodType === t ? "var(--accent)" : "transparent",
                    color: periodType === t ? "#000000" : "var(--muted)",
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
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void savePlan()}
            className="rounded-[10px] px-4 py-2 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#000000" }}
          >
            {saving ? "Сохранение…" : "Сохранить план"}
          </button>
        </div>

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

        {hasCrm && factsLoading && !loading ? (
          <div
            className="flex flex-wrap items-center gap-3 rounded-[7px] border px-3 py-2 text-[13px]"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
              color: "var(--hint)",
            }}
          >
            <span>
              Загрузка факта: <strong style={{ color: "var(--text)" }}>{factsElapsedSec}</strong> с
            </span>
            {factsElapsedSec > 25 ? (
              <button
                type="button"
                onClick={() => void fetchFactsFromBitrix()}
                className="rounded-[7px] border px-3 py-1 text-[12px] font-medium"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                }}
              >
                Повторить
              </button>
            ) : null}
          </div>
        ) : null}

        {loading ? (
          <p className="text-[13px]" style={{ color: "var(--hint)" }}>
            Загрузка…
          </p>
        ) : null}

        <div
          className="animate-fade-up rounded-[12px] border p-5 delay-1"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <p className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em]" style={{ color: "var(--muted)" }}>
            Общий план — {periodLabel}
          </p>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[13px]" style={{ color: "var(--hint)" }}>
              План:
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={teamPlan}
              onChange={(e) => setTeamPlan(e.target.value)}
              placeholder="0"
              className="font-metric min-w-[160px] rounded-[10px] border px-3 py-2 text-[14px] font-semibold"
              style={{
                borderColor: "var(--border2)",
                background: "var(--surface2)",
                color: "var(--text)",
              }}
            />
            <span className="text-[13px]" style={{ color: "var(--muted)" }}>
              ₸
            </span>
          </div>
          <p className="text-[13px]" style={{ color: "var(--text)" }}>
            <span style={{ color: "var(--hint)" }}>Факт: </span>
            {factsLoading ? (
              <span
                className="inline-block h-4 w-28 animate-pulse rounded"
                style={{ background: "var(--border)" }}
              />
            ) : (
              <>
                {formatCurrency(teamFact)} ₸
              </>
            )}
            {!factsLoading && (teamTargetNum > 0 || teamFact > 0) ? (
              <>
                {" "}
                <span style={{ color: "var(--hint)" }}>·</span>{" "}
                <span style={{ color: teamPctStyle.color }} className="font-medium">
                  {teamPctStyle.text}
                </span>
              </>
            ) : null}
          </p>
          {teamTargetNum > 0 && !factsLoading ? (
            <div
              className="mt-2 h-2 w-full max-w-md overflow-hidden rounded-full"
              style={{ background: "var(--border)" }}
            >
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, teamPct)}%`,
                  background:
                    teamPct > 100
                      ? "var(--blue)"
                      : teamPct >= 70
                        ? "var(--accent)"
                        : "var(--red)",
                }}
              />
            </div>
          ) : null}
          {forecast && teamTargetNum > 0 ? (
            <p className="mt-3 text-[13px]" style={{ color: "var(--text)" }}>
              <span style={{ color: "var(--hint)" }}>Прогноз: </span>
              при текущем темпе —{" "}
              <strong>{formatCurrency(Math.round(forecast.forecastEnd))} ₸</strong>
            </p>
          ) : null}
        </div>

        <div
          className="animate-fade-up overflow-x-auto rounded-[12px] border delay-2"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <thead>
              <tr
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--hint)" }}
              >
                <th className="px-3 py-2 font-medium">Менеджер</th>
                <th className="px-3 py-2 font-medium">План ₸</th>
                <th className="px-3 py-2 font-medium">Факт ₸</th>
                <th className="px-3 py-2 font-medium">%</th>
                <th className="px-3 py-2 font-medium">Прогресс</th>
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
                    className="transition-colors hover:bg-[#1a1a1a]"
                    style={{ borderTop: "1px solid #1a1a1a" }}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                          style={{
                            background: "var(--accent)",
                            color: "#000000",
                          }}
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
                    <td className="px-3 py-2">
                      {factsLoading ? (
                        <span
                          className="inline-block h-1.5 w-28 animate-pulse rounded-full"
                          style={{ background: "var(--border)" }}
                        />
                      ) : planVal > 0 ? (
                        <div
                          className="h-1.5 w-28 overflow-hidden rounded-full"
                          style={{ background: "var(--border)" }}
                        >
                          <div
                            className="h-1.5 rounded-full"
                            style={{
                              width: `${Math.min(100, barPct)}%`,
                              background:
                                col === "var(--muted)"
                                  ? "var(--border)"
                                  : barPct > 100
                                    ? "var(--blue)"
                                    : barPct < 70
                                      ? "var(--red)"
                                      : "var(--accent)",
                            }}
                          />
                        </div>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div
          className="animate-fade-up rounded-[12px] border p-5 delay-3"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <p
            className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em]"
            style={{ color: "var(--muted)" }}
          >
            План vs факт (нарастающий итог)
          </p>
          <div className="h-72 w-full min-w-0">
            {chart.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#555555", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => v.slice(5)}
                  />
                  <YAxis
                    tick={{ fill: "#555555", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(val) =>
                      formatCurrency(typeof val === "number" ? val : Number(val))
                    }
                    contentStyle={{
                      background: "#1a1a1a",
                      border: "1px solid #333333",
                      borderRadius: 8,
                      fontSize: 11,
                      color: "#ffffff",
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="fact"
                    name="Факт"
                    stroke="#c8ff00"
                    strokeWidth={2}
                    dot={{ fill: "#c8ff00", r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="planLine"
                    name="План (темп)"
                    stroke="#4488ff"
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
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

        <div
          className="animate-fade-up rounded-[12px] border p-5 delay-4"
          style={{ background: "var(--surface2)", borderColor: "var(--border)" }}
        >
          <p
            className="mb-2 text-[13px] font-medium uppercase tracking-[0.08em]"
            style={{ color: "var(--muted)" }}
          >
            Прогноз
          </p>
          {forecast && teamTargetNum > 0 ? (
            <ul className="space-y-1.5 text-[13px]" style={{ color: "var(--text)" }}>
              <li>
                <span style={{ color: "var(--hint)" }}>Период: </span>
                {rangeStart.toLocaleDateString("ru-RU")} —{" "}
                {rangeEnd.toLocaleDateString("ru-RU")}
              </li>
              <li>
                <span style={{ color: "var(--hint)" }}>Прошло дней: </span>
                {forecast.daysPassed} из {forecast.totalDays}
              </li>
              <li>
                <span style={{ color: "var(--hint)" }}>Текущий темп: </span>
                {formatCurrency(Math.round(forecast.pacePerDay))} ₸/день
              </li>
              <li>
                <span style={{ color: "var(--hint)" }}>Прогноз к концу периода: </span>
                {formatCurrency(Math.round(forecast.forecastEnd))} ₸
              </li>
              {forecastText ? (
                <li className="pt-1 font-medium">{forecastText}</li>
              ) : null}
            </ul>
          ) : (
            <p className="text-[13px]" style={{ color: "var(--hint)" }}>
              Задайте общий план команды — появится прогноз.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
