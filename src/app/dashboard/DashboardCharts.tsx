"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardHeader } from "@/components/ui";

type Props = { dateFrom: string; dateTo: string };

const GRID = "rgba(255,255,255,0.05)";
const TICK = { fill: "rgba(255,255,255,0.35)", fontSize: 11 };
const TIP = {
  background: "rgba(26,22,53,0.9)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  color: "#ffffff",
  fontSize: 11,
};

export function DashboardCharts({ dateFrom, dateTo }: Props) {
  const [series, setSeries] = useState<{ date: string; count: number }[]>([]);
  const [sources, setSources] = useState<{ source: string; count: number }[]>(
    [],
  );
  const [fetchError, setFetchError] = useState<string | null>(null);

  const qs = new URLSearchParams({ dateFrom, dateTo });
  const q = qs.toString();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFetchError(null);
      try {
        const [cRes, sRes, mRes] = await Promise.all([
          fetch(`/api/dashboard/chart?${q}`, { cache: "no-store" }),
          fetch(`/api/leads/sources?${q}`, { cache: "no-store" }),
          fetch(`/api/dashboard/metrics?${q}`, { cache: "no-store" }),
        ]);

        if (!cRes.ok) {
          const t = await cRes.text();
          throw new Error(t.slice(0, 200) || `chart ${cRes.status}`);
        }
        if (!sRes.ok) {
          const t = await sRes.text();
          throw new Error(t.slice(0, 200) || `sources ${sRes.status}`);
        }
        if (!mRes.ok) {
          const t = await mRes.text();
          throw new Error(t.slice(0, 200) || `metrics ${mRes.status}`);
        }

        const cJson: unknown = await cRes.json();
        const sJson: unknown = await sRes.json();
        await mRes.json();

        const cSeries = (cJson as { series?: unknown })?.series;
        const sSrc = (sJson as { sources?: unknown })?.sources;

        if (!cancelled) {
          setSeries(Array.isArray(cSeries) ? (cSeries as typeof series) : []);
          setSources(Array.isArray(sSrc) ? (sSrc as typeof sources) : []);
        }
      } catch (e) {
        if (!cancelled) {
          setSeries([]);
          setSources([]);
          setFetchError(e instanceof Error ? e.message : "Ошибка загрузки");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q]);

  const lineData = series.length ? series : [{ date: "—", count: 0 }];
  const barData = sources.length ? sources : [{ source: "—", count: 0 }];

  return (
    <div className="space-y-3">
      {fetchError ? (
        <p
          className="rounded-[12px] border px-3 py-2 text-[13px]"
          style={{
            background: "var(--amber-bg)",
            borderColor: "var(--border)",
            color: "var(--amber)",
          }}
        >
          Графики: {fetchError} (проверьте БД и{" "}
          <code className="text-[11px]">DATABASE_URL</code>)
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="min-h-64 min-w-0">
          <CardHeader title="Лиды по дням" sub="динамика" />
          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData}>
                <defs>
                  <linearGradient id="dashPurple" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#7B5CF5" />
                    <stop offset="100%" stopColor="#E040FB" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis
                  dataKey="date"
                  tick={TICK}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={TICK} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TIP} />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="url(#dashPurple)"
                  strokeWidth={2.5}
                  dot={{ fill: "#7B5CF5", r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="min-h-64 min-w-0">
          <CardHeader title="Каналы" sub="лиды по источнику" />
          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis
                  type="number"
                  tick={TICK}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="source"
                  width={100}
                  tick={{ fill: "#555555", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={TIP} />
                <Legend />
                <Bar
                  dataKey="count"
                  fill="#7B5CF5"
                  name="Лиды"
                  radius={[0, 4, 4, 0]}
                  opacity={0.9}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
