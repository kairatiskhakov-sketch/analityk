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

type Props = { period: string };

export function DashboardCharts({ period }: Props) {
  const [series, setSeries] = useState<{ date: string; count: number }[]>([]);
  const [sources, setSources] = useState<{ source: string; count: number }[]>(
    [],
  );
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFetchError(null);
      try {
        const [cRes, sRes] = await Promise.all([
          fetch(`/api/dashboard/chart?period=${encodeURIComponent(period)}`),
          fetch(`/api/leads/sources?period=${encodeURIComponent(period)}`),
        ]);

        if (!cRes.ok) {
          const t = await cRes.text();
          throw new Error(t.slice(0, 200) || `chart ${cRes.status}`);
        }
        if (!sRes.ok) {
          const t = await sRes.text();
          throw new Error(t.slice(0, 200) || `sources ${sRes.status}`);
        }

        const cJson: unknown = await cRes.json();
        const sJson: unknown = await sRes.json();

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
  }, [period]);

  const lineData = series.length ? series : [{ date: "—", count: 0 }];
  const barData = sources.length ? sources : [{ source: "—", count: 0 }];

  return (
    <div className="space-y-4">
      {fetchError ? (
        <p className="rounded-lg border border-amber-900/60 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
          Графики: {fetchError} (проверьте БД и{" "}
          <code className="text-xs">DATABASE_URL</code>)
        </p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="min-h-64 min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="mb-4 text-sm font-medium text-zinc-300">
            Лиды по дням
          </h2>
          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis dataKey="date" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #3f3f46",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#34d399"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="min-h-64 min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="mb-4 text-sm font-medium text-zinc-300">Каналы</h2>
          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis type="number" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="source"
                  width={100}
                  tick={{ fill: "#a1a1aa", fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #3f3f46",
                  }}
                />
                <Legend />
                <Bar
                  dataKey="count"
                  fill="#22c55e"
                  name="Лиды"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
