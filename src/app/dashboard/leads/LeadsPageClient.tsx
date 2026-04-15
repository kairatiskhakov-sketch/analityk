"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  Card,
  CardHeader,
  KpiCard
} from "@/components/ui";
import { GlobalFilters } from "@/components/ui/GlobalFilters";
import { Bar, BarChart, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type LeadMetric = {
  totalLeads: number;
  newLeads: number;
  inProgress: number;
  won: number;
  conversion: number;
  lost: number;
  lostRate: number;
  avgFirstContactHours: number;
  avgCloseDays: number;
  staleLeads: number;
  fastestManager: string | null;
};

type LeadRow = {
  id: string;
  title: string;
  source: string;
  managerId: string;
  manager: string;
  amount: number;
  statusType: "new" | "progress" | "won" | "lost";
  createdAt: string;
  lostReason: string | null;
  daysInWork: number;
};

type SortKey = "title" | "source" | "manager" | "amount" | "statusType" | "createdAt" | "lostReason" | "daysInWork";

export function LeadsPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<LeadMetric | null>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [fails, setFails] = useState<any[]>([]);
  const [funnel, setFunnel] = useState<any[]>([]);
  const [list, setList] = useState<any>({ leads: [], total: 0, page: 1, pages: 0 });
  const [chartMode, setChartMode] = useState<"day" | "week">("day");
  const [sourceFilter, setSourceFilter] = useState(searchParams.get("source") ?? "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(Number(searchParams.get("page") || "1"));
  const [tableStatusFilter, setTableStatusFilter] = useState("");
  const [tableSourceFilter, setTableSourceFilter] = useState("");
  const [tableManagerFilter, setTableManagerFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const query = useMemo(() => {
    const q = new URLSearchParams(searchParams.toString());
    if (sourceFilter) q.set("source", sourceFilter); else q.delete("source");
    if (statusFilter) q.set("status", statusFilter); else q.delete("status");
    return q.toString();
  }, [searchParams, sourceFilter, statusFilter]);

  const listQuery = useMemo(() => {
    const q = new URLSearchParams(query);
    q.set("page", String(page));
    q.set("limit", "20");
    if (search) q.set("search", search); else q.delete("search");
    if (tableStatusFilter) q.set("status", tableStatusFilter);
    if (tableSourceFilter) q.set("source", tableSourceFilter);
    if (tableManagerFilter) q.set("managerId", tableManagerFilter);
    q.set("sortBy", sortKey);
    q.set("sortDir", sortDir);
    return q.toString();
  }, [query, page, search, tableStatusFilter, tableSourceFilter, tableManagerFilter, sortKey, sortDir]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [m, s, f, fun] = await Promise.all([
          fetch(`/api/leads/metrics?${query}`).then((r) => r.json()),
          fetch(`/api/leads/sources?${query}`).then((r) => r.json()),
          fetch(`/api/leads/fails?${query}`).then((r) => r.json()),
          fetch(`/api/leads/funnel?${query}`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setMetrics(m.metrics ?? null);
        setSources(s.sources ?? []);
        setFails(f.fails ?? []);
        setFunnel(fun.stages ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/leads/list?${listQuery}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setList(data);
      })
      .catch(() => {
        if (!cancelled) setList({ leads: [], total: 0, page: 1, pages: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [listQuery]);

  const series = useMemo(() => {
    const bucket = new Map<string, { leads: number; won: number; lost: number }>();
    for (const row of list.leads ?? []) {
      const dt = String(row.createdAt ?? "").slice(0, 10);
      const key = chartMode === "week" ? `${dt.slice(0, 8)}01` : dt;
      const cur = bucket.get(key) ?? { leads: 0, won: 0, lost: 0 };
      cur.leads += 1;
      if (row.statusType === "won") cur.won += 1;
      if (row.statusType === "lost") cur.lost += 1;
      bucket.set(key, cur);
    }
    return Array.from(bucket.entries()).map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));
  }, [list.leads, chartMode]);

  const managerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of (list.leads ?? []) as LeadRow[]) {
      if (!l.managerId) continue;
      map.set(l.managerId, l.manager);
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [list.leads]);

  const sourceOptions = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const l of (list.leads ?? []) as LeadRow[]) {
      if (l.source) set.add(l.source);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [list.leads]);

  function applyTopFilters() {
    setPage(1);
    router.push(`${pathname}?${query}`);
  }

  function sourceIcon(source: string): string {
    const s = source.toLowerCase();
    if (s.includes("звон")) return "📞";
    if (s.includes("сайт")) return "🌐";
    if (s.includes("тарг")) return "🎯";
    if (s.includes("рекомен")) return "🤝";
    return "🧩";
  }

  function onSort(next: SortKey) {
    setPage(1);
    if (next === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(next);
    setSortDir("asc");
  }

  function statusBadge(status: string) {
    if (status === "won") return { label: "Выиграно", bg: "rgba(0,230,118,.2)", color: "#00E676" };
    if (status === "lost") return { label: "Провалено", bg: "rgba(255,82,82,.2)", color: "#FF5252" };
    if (status === "new") return { label: "Новый", bg: "rgba(76,157,255,.2)", color: "#4C9DFF" };
    return { label: "В работе", bg: "rgba(255,193,7,.2)", color: "#FFC107" };
  }

  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
      <GlobalFilters showStages={false} />

      <Card>
        <CardHeader title="Фильтры лидов" />
        <div className="grid gap-2 md:grid-cols-4">
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="rounded-[10px] border bg-transparent px-3 py-2 text-[13px]">
            <option value="">Все источники</option>
            {sources.map((s) => <option key={s.source} value={s.source}>{s.source}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-[10px] border bg-transparent px-3 py-2 text-[13px]">
            <option value="">Все статусы</option>
            <option value="new">Новый</option>
            <option value="progress">В работе</option>
            <option value="won">Выиграно</option>
            <option value="lost">Провал</option>
          </select>
          <div />
          <button onClick={applyTopFilters} className="btn-primary rounded-[10px] px-3 py-2 text-[13px]">Применить</button>
        </div>
      </Card>

      <div className="grid gap-2.5 md:grid-cols-5">
        <KpiCard label="Всего лидов" value={formatNumber(metrics?.totalLeads ?? 0)} />
        <KpiCard label="Новых" value={formatNumber(metrics?.newLeads ?? 0)} />
        <KpiCard label="В работе" value={formatNumber(metrics?.inProgress ?? 0)} />
        <KpiCard label="Выиграно" value={formatNumber(metrics?.won ?? 0)} chip={{ type: "up", text: `${metrics?.conversion ?? 0}%` }} />
        <KpiCard label="Провалено" value={formatNumber(metrics?.lost ?? 0)} chip={{ type: "down", text: `${metrics?.lostRate ?? 0}%` }} />
      </div>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <CardHeader title="Динамика лидов" />
          <div className="inline-flex rounded-[10px] border p-1">
            <button className="rounded-[8px] px-2 py-1 text-[12px]" onClick={() => setChartMode("day")} style={{ background: chartMode === "day" ? "rgba(123,92,245,.25)" : "transparent" }}>По дням</button>
            <button className="rounded-[8px] px-2 py-1 text-[12px]" onClick={() => setChartMode("week")} style={{ background: chartMode === "week" ? "rgba(123,92,245,.25)" : "transparent" }}>По неделям</button>
          </div>
        </div>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <XAxis dataKey="date" stroke="rgba(255,255,255,.45)" />
              <YAxis stroke="rgba(255,255,255,.45)" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="leads" stroke="#4C9DFF" strokeWidth={2} />
              <Line type="monotone" dataKey="won" stroke="#00E676" strokeWidth={2} />
              <Line type="monotone" dataKey="lost" stroke="#FF5252" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardHeader title="Воронка лидов (реальные этапы)" />
        <div className="space-y-2">
          {funnel.map((st: any) => (
            <div key={st.id} className="rounded-[10px] border px-3 py-2">
              <div className="flex items-center justify-between text-[13px]">
                <span>{st.name}</span>
                <span>{st.count} · {st.passPct}%</span>
              </div>
              <div className="mt-1 h-2 rounded-full" style={{ background: "rgba(255,255,255,.08)" }}>
                <div className="h-2 rounded-full" style={{ width: `${Math.max(4, st.passPct)}%`, background: st.type === "won" ? "#00E676" : st.type === "lost" ? "#FF5252" : "#4C9DFF" }} />
              </div>
              <div className="mt-1 text-[11px]" style={{ color: st.dropPct > 40 ? "#FF5252" : "var(--hint)" }}>Отвал: {st.dropPct}%</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader title="Источники лидов" />
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sources} dataKey="count" nameKey="source" outerRadius={80}>
                  {sources.map((_: any, i: number) => <Cell key={i} fill={["#7B5CF5", "#4C9DFF", "#00E676", "#FFC107", "#E040FB"][i % 5]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Причины провалов" />
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fails} layout="vertical">
                <XAxis type="number" stroke="rgba(255,255,255,.45)" />
                <YAxis type="category" dataKey="reason" width={140} stroke="rgba(255,255,255,.45)" />
                <Tooltip />
                <Bar dataKey="count" fill="#FF5252" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-3 grid gap-2 md:grid-cols-4">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по имени" className="rounded-[10px] border bg-transparent px-3 py-2 text-[13px]" />
          <select value={tableStatusFilter} onChange={(e) => setTableStatusFilter(e.target.value)} className="rounded-[10px] border bg-transparent px-3 py-2 text-[13px]">
            <option value="">Статус: все</option>
            <option value="new">Новый</option>
            <option value="progress">В работе</option>
            <option value="won">Выиграно</option>
            <option value="lost">Провалено</option>
          </select>
          <select value={tableSourceFilter} onChange={(e) => setTableSourceFilter(e.target.value)} className="rounded-[10px] border bg-transparent px-3 py-2 text-[13px]">
            <option value="">Источник: все</option>
            {sourceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={tableManagerFilter} onChange={(e) => setTableManagerFilter(e.target.value)} className="rounded-[10px] border bg-transparent px-3 py-2 text-[13px]">
            <option value="">Менеджер: все</option>
            {managerOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ color: "var(--hint)" }}>
                <th className="cursor-pointer text-left py-2" onClick={() => onSort("title")}>Клиент</th>
                <th className="cursor-pointer text-left py-2" onClick={() => onSort("source")}>Источник</th>
                <th className="cursor-pointer text-left py-2" onClick={() => onSort("manager")}>Менеджер</th>
                <th className="cursor-pointer text-right py-2" onClick={() => onSort("amount")}>Сумма</th>
                <th className="cursor-pointer text-left py-2" onClick={() => onSort("statusType")}>Статус</th>
                <th className="cursor-pointer text-left py-2" onClick={() => onSort("createdAt")}>Создан</th>
                <th className="cursor-pointer text-left py-2" onClick={() => onSort("lostReason")}>Причина</th>
                <th className="cursor-pointer text-right py-2" onClick={() => onSort("daysInWork")}>Дней</th>
              </tr>
            </thead>
            <tbody>
              {(list.leads ?? []).map((r: LeadRow) => {
                const badge = statusBadge(r.statusType);
                return <tr key={r.id} className="border-t" style={{ borderColor: "rgba(255,255,255,.06)" }}>
                  <td className="py-2">{r.title}</td>
                  <td><span className="mr-1">{sourceIcon(r.source)}</span>{r.source}</td>
                  <td>{r.manager}</td>
                  <td className="text-right">{formatCurrency(r.amount, true)}</td>
                  <td><span className="rounded-full px-2 py-1 text-[11px]" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span></td>
                  <td>{String(r.createdAt ?? "").slice(0, 10)}</td><td>{r.lostReason ?? "—"}</td><td className="text-right">{r.daysInWork}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-[12px]">
          <span>Всего: {list.total ?? 0}</span>
          <div className="inline-flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border px-2 py-1 disabled:opacity-50">Назад</button>
            <span>{page} / {list.pages ?? 1}</span>
            <button disabled={page >= (list.pages ?? 1)} onClick={() => setPage((p) => p + 1)} className="rounded border px-2 py-1 disabled:opacity-50">Вперёд</button>
          </div>
        </div>
      </Card>

      <div className="grid gap-2.5 md:grid-cols-4">
        <KpiCard label="До первого контакта" value={`${metrics?.avgFirstContactHours ?? 0} ч`} />
        <KpiCard label="До закрытия сделки" value={`${metrics?.avgCloseDays ?? 0} д`} />
        <KpiCard label="Без активности > 3 дней" value={formatNumber(metrics?.staleLeads ?? 0)} chip={{ type: "down", text: "внимание" }} />
        <KpiCard label="Самый быстрый менеджер" value={metrics?.fastestManager ?? "—"} />
      </div>

      {loading ? <div className="text-[12px]" style={{ color: "var(--hint)" }}>Обновление данных...</div> : null}
    </div>
  );
}
