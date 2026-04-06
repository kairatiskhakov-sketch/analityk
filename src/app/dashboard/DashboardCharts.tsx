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

  const tipStyle = {
    background: "var(--text)",
    border: "none",
    borderRadius: 8,
    fontSize: 11,
    color: "#fff",
  };

  return (
    <div className="space-y-3">
      {fetchError ? (
        <p
          className="rounded-[11px] border px-3 py-2 text-[13px]"
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "var(--hint)", fontSize: 11 }}
                />
                <YAxis tick={{ fill: "var(--hint)", fontSize: 11 }} />
                <Tooltip contentStyle={tipStyle} />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="var(--blue)"
                  strokeWidth={2}
                  dot={false}
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  type="number"
                  tick={{ fill: "var(--hint)", fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="source"
                  width={100}
                  tick={{ fill: "var(--hint)", fontSize: 10 }}
                />
                <Tooltip contentStyle={tipStyle} />
                <Legend />
                <Bar
                  dataKey="count"
                  fill="var(--green)"
                  name="Лиды"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
