"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardHeader, PageTopBar } from "@/components/ui";
import { GlobalFilters } from "@/components/ui/GlobalFilters";
import { formatCurrency, formatNumber } from "@/lib/utils";

type Platform = "META" | "TIKTOK" | "GOOGLE";

type PlatformAgg = {
  platform: Platform;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  attributedDeals: number;
  cpl: number | null;
  cpDeal: number | null;
};

type CampaignAgg = {
  campaignId: string;
  name: string;
  platform: Platform;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  attributedDeals: number;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  cpl: number | null;
  cpDeal: number | null;
};

type DailyPoint = {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
};

type RoiResponse = {
  ok?: boolean;
  range?: { from: string; to: string };
  overall?: {
    spend: number;
    impressions: number;
    clicks: number;
    leads: number;
    attributedDeals: number;
    cpl: number | null;
    cpDeal: number | null;
    ctr: number | null;
    cpm: number | null;
    cpc: number | null;
  };
  byPlatform?: PlatformAgg[];
  byCampaign?: CampaignAgg[];
  daily?: DailyPoint[];
  error?: string;
};

const PLATFORM_LABEL: Record<Platform, string> = {
  META: "Meta",
  TIKTOK: "TikTok",
  GOOGLE: "Google",
};

const PLATFORM_COLOR: Record<Platform, string> = {
  META: "#4F8AF7",
  TIKTOK: "#E040FB",
  GOOGLE: "#FFB74D",
};

function fmtMoney(v: number | null | undefined, compact = false): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return formatCurrency(v, compact);
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(Math.round(v * 100) / 100).toFixed(2)}%`;
}

function safeDivide(num: number, den: number): number | null {
  if (!den || !Number.isFinite(den)) return null;
  const v = num / den;
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

export function MarketingClient({
  dateFrom,
  dateTo,
  rangeLabel,
}: {
  dateFrom: string;
  dateTo: string;
  rangeLabel: string;
}) {
  const [data, setData] = useState<RoiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const q = new URLSearchParams({
          from: dateFrom,
          to: dateTo,
          withDaily: "1",
        });
        const res = await fetch(`/api/ads/roi?${q}`, { cache: "no-store" });
        const json = (await res.json()) as RoiResponse;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) {
          setData({
            ok: false,
            error: e instanceof Error ? e.message : "Ошибка",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo]);

  const overall = data?.overall;
  const byPlatform = data?.byPlatform ?? [];
  const byCampaign = data?.byCampaign ?? [];
  const daily = data?.daily ?? [];

  const hasAny =
    !!overall &&
    (overall.spend > 0 || overall.impressions > 0 || overall.leads > 0);

  const conversions = useMemo(() => {
    if (!overall) return { ctr: null, clickToLead: null, leadToDeal: null };
    return {
      ctr: overall.ctr,
      clickToLead: safeDivide(overall.leads * 100, overall.clicks),
      leadToDeal: safeDivide(overall.attributedDeals * 100, overall.leads),
    };
  }, [overall]);

  const topCampaignsByBudget = useMemo(
    () => [...byCampaign].sort((a, b) => b.spend - a.spend).slice(0, 8),
    [byCampaign],
  );

  const topCampaignsByLeads = useMemo(
    () =>
      [...byCampaign]
        .sort((a, b) => b.leads + b.attributedDeals - (a.leads + a.attributedDeals))
        .slice(0, 8),
    [byCampaign],
  );

  return (
    <>
      <PageTopBar title="Маркетинг" sub={rangeLabel} />
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <GlobalFilters showStages={false} />

        {loading ? (
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="h-[88px] rounded-[14px]"
                style={{ background: "var(--border)" }}
              />
            ))}
          </div>
        ) : !data?.ok ? (
          <Card className="mt-4">
            <CardHeader title="Маркетинг" />
            <p className="text-[12px]" style={{ color: "var(--muted)" }}>
              {data?.error ?? "Не удалось загрузить данные."}
            </p>
          </Card>
        ) : !hasAny ? (
          <EmptyState />
        ) : (
          <div className="mt-4 space-y-4">
            {/* 6 KPI: Бюджет / Показы / Клики / CTR / Лиды / Сделки атриб. */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <KpiTile
                label="Бюджет"
                value={fmtMoney(overall!.spend, true)}
                accent="amber"
              />
              <KpiTile
                label="Показы"
                value={formatNumber(overall!.impressions)}
              />
              <KpiTile
                label="Клики"
                value={formatNumber(overall!.clicks)}
                accent="blue"
              />
              <KpiTile label="CTR" value={fmtPct(overall!.ctr)} />
              <KpiTile
                label="Лиды (площадки)"
                value={formatNumber(overall!.leads)}
                accent="green"
              />
              <KpiTile
                label="Сделки (атриб.)"
                value={formatNumber(overall!.attributedDeals)}
                accent="accent"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Цены действий */}
              <Card>
                <CardHeader title="Цены действий" />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MiniMetric label="CPM" value={fmtMoney(overall!.cpm)} />
                  <MiniMetric label="CPC" value={fmtMoney(overall!.cpc)} />
                  <MiniMetric label="CPL" value={fmtMoney(overall!.cpl)} />
                  <MiniMetric
                    label="Цена сделки"
                    value={fmtMoney(overall!.cpDeal)}
                  />
                </div>
              </Card>

              {/* Конверсии */}
              <Card>
                <CardHeader title="Конверсии" />
                <div className="grid grid-cols-3 gap-3">
                  <MiniMetric label="CTR" value={fmtPct(conversions.ctr)} />
                  <MiniMetric
                    label="Click → Lead"
                    value={fmtPct(conversions.clickToLead)}
                  />
                  <MiniMetric
                    label="Lead → Deal"
                    value={fmtPct(conversions.leadToDeal)}
                  />
                </div>
              </Card>
            </div>

            {/* Динамика */}
            {daily.length > 1 ? (
              <Card>
                <CardHeader
                  title="Динамика"
                  sub="Бюджет, клики и лиды по дням"
                />
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={daily}
                      margin={{ top: 10, right: 16, bottom: 0, left: 0 }}
                    >
                      <CartesianGrid
                        stroke="var(--border)"
                        strokeDasharray="3 3"
                      />
                      <XAxis
                        dataKey="date"
                        stroke="var(--hint)"
                        fontSize={11}
                      />
                      <YAxis
                        yAxisId="left"
                        stroke="var(--hint)"
                        fontSize={11}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="var(--hint)"
                        fontSize={11}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          borderRadius: 10,
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="spend"
                        name="Бюджет, ₸"
                        stroke="var(--amber)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="clicks"
                        name="Клики"
                        stroke="var(--blue)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="leads"
                        name="Лиды"
                        stroke="var(--green)"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            ) : null}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Платформы */}
              <Card>
                <CardHeader title="Распределение бюджета" sub="По платформам" />
                {byPlatform.length > 0 ? (
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={byPlatform}
                          dataKey="spend"
                          nameKey="platform"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={2}
                        >
                          {byPlatform.map((p) => (
                            <Cell
                              key={p.platform}
                              fill={PLATFORM_COLOR[p.platform]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: 10,
                            fontSize: 12,
                          }}
                          formatter={(value, _name, payload) => {
                            const platform = (
                              payload?.payload as PlatformAgg | undefined
                            )?.platform;
                            return [
                              fmtMoney(typeof value === "number" ? value : Number(value)),
                              platform ? PLATFORM_LABEL[platform] : "",
                            ];
                          }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 11 }}
                          formatter={(v: string) =>
                            PLATFORM_LABEL[v as Platform] ?? v
                          }
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p
                    className="text-[12px]"
                    style={{ color: "var(--muted)" }}
                  >
                    Нет данных
                  </p>
                )}
              </Card>

              {/* Топ кампаний по бюджету */}
              <Card>
                <CardHeader title="Топ кампаний" sub="По бюджету" />
                {topCampaignsByBudget.length > 0 ? (
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={topCampaignsByBudget}
                        layout="vertical"
                        margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
                      >
                        <CartesianGrid
                          stroke="var(--border)"
                          strokeDasharray="3 3"
                          horizontal={false}
                        />
                        <XAxis
                          type="number"
                          stroke="var(--hint)"
                          fontSize={11}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          stroke="var(--hint)"
                          fontSize={11}
                          width={140}
                          tickFormatter={(v: string) =>
                            v.length > 18 ? `${v.slice(0, 18)}…` : v
                          }
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: 10,
                            fontSize: 12,
                          }}
                          formatter={(value) =>
                            fmtMoney(
                              typeof value === "number" ? value : Number(value),
                            )
                          }
                        />
                        <Bar dataKey="spend" radius={[0, 6, 6, 0]}>
                          {topCampaignsByBudget.map((c) => (
                            <Cell
                              key={c.campaignId}
                              fill={PLATFORM_COLOR[c.platform]}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p
                    className="text-[12px]"
                    style={{ color: "var(--muted)" }}
                  >
                    Нет данных
                  </p>
                )}
              </Card>
            </div>

            {/* Pivot table */}
            <Card>
              <CardHeader
                title="Кампании"
                sub="Бюджет, показы, клики, CTR, CPM, CPC, CPL, цена сделки"
              />
              {byCampaign.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr
                        className="text-left"
                        style={{ color: "var(--muted)" }}
                      >
                        <th className="pb-2 font-medium">Кампания</th>
                        <th className="pb-2 font-medium">Платформа</th>
                        <th className="pb-2 text-right font-medium">Бюджет</th>
                        <th className="pb-2 text-right font-medium">Показы</th>
                        <th className="pb-2 text-right font-medium">Клики</th>
                        <th className="pb-2 text-right font-medium">CTR</th>
                        <th className="pb-2 text-right font-medium">CPM</th>
                        <th className="pb-2 text-right font-medium">CPC</th>
                        <th className="pb-2 text-right font-medium">Лиды</th>
                        <th className="pb-2 text-right font-medium">CPL</th>
                        <th className="pb-2 text-right font-medium">Сделки</th>
                        <th className="pb-2 text-right font-medium">Цена сделки</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byCampaign.map((c) => (
                        <tr
                          key={c.campaignId}
                          className="border-t"
                          style={{ borderColor: "rgba(255,255,255,0.05)" }}
                        >
                          <td
                            className="max-w-[260px] truncate py-2"
                            style={{ color: "var(--text)" }}
                            title={c.name}
                          >
                            {c.name}
                          </td>
                          <td className="py-2" style={{ color: "var(--muted)" }}>
                            {PLATFORM_LABEL[c.platform]}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {fmtMoney(c.spend)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {formatNumber(c.impressions)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {formatNumber(c.clicks)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {fmtPct(c.ctr)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {fmtMoney(c.cpm)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {fmtMoney(c.cpc)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {formatNumber(c.leads)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {fmtMoney(c.cpl)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {formatNumber(c.attributedDeals)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {fmtMoney(c.cpDeal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[12px]" style={{ color: "var(--muted)" }}>
                  Нет кампаний за выбранный период
                </p>
              )}
            </Card>

            {/* Лиды по кампаниям */}
            {topCampaignsByLeads.some((c) => c.leads + c.attributedDeals > 0) ? (
              <Card>
                <CardHeader
                  title="Лиды по кампаниям"
                  sub="Лиды и атрибутированные сделки"
                />
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={topCampaignsByLeads}
                      margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
                    >
                      <CartesianGrid
                        stroke="var(--border)"
                        strokeDasharray="3 3"
                      />
                      <XAxis
                        dataKey="name"
                        stroke="var(--hint)"
                        fontSize={11}
                        tickFormatter={(v: string) =>
                          v.length > 14 ? `${v.slice(0, 14)}…` : v
                        }
                      />
                      <YAxis stroke="var(--hint)" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          borderRadius: 10,
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar
                        dataKey="leads"
                        name="Лиды"
                        fill="var(--blue)"
                        stackId="a"
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar
                        dataKey="attributedDeals"
                        name="Сделки (атриб.)"
                        fill="var(--green)"
                        stackId="a"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}

function KpiTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "amber" | "blue" | "green" | "accent";
}) {
  const accentColor =
    accent === "amber"
      ? "var(--amber)"
      : accent === "blue"
        ? "var(--blue)"
        : accent === "green"
          ? "var(--green)"
          : accent === "accent"
            ? "var(--accent)"
            : "var(--text)";
  return (
    <div
      className="glass rounded-[14px] border px-4 py-3"
      style={{ borderColor: "var(--border)" }}
    >
      <p
        className="text-[10px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--hint)" }}
      >
        {label}
      </p>
      <p
        className="mt-1 text-[20px] font-semibold tabular-nums"
        style={{ color: accentColor }}
      >
        {value}
      </p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-[12px] border px-3 py-2"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <p
        className="text-[10px] font-medium uppercase tracking-wide"
        style={{ color: "var(--hint)" }}
      >
        {label}
      </p>
      <p
        className="mt-1 text-[16px] font-semibold tabular-nums"
        style={{ color: "var(--text)" }}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="mt-4">
      <CardHeader title="Нет данных по рекламе" />
      <div className="flex flex-col items-start gap-3 py-2">
        <p className="text-[13px]" style={{ color: "var(--muted)" }}>
          За выбранный период нет рекламной активности. Подключите рекламные
          кабинеты (Meta, TikTok, Google Ads), чтобы видеть бюджет, показы,
          клики, лиды и атрибутированные сделки в одном дашборде.
        </p>
        <ul
          className="list-disc pl-5 text-[12px]"
          style={{ color: "var(--hint)" }}
        >
          <li>Бюджет, показы, клики, CTR, CPM, CPC</li>
          <li>Лиды с площадок и атрибутированные сделки в Bitrix24</li>
          <li>CPL, цена сделки, ROI по кампаниям и платформам</li>
          <li>Динамика по дням и пивот по кампаниям</li>
        </ul>
        <Link
          href="/dashboard/settings"
          className="mt-1 rounded-[10px] px-4 py-2 text-[13px] font-medium no-underline"
          style={{
            background: "var(--accent)",
            color: "#fff",
          }}
        >
          Подключить рекламные кабинеты →
        </Link>
      </div>
    </Card>
  );
}
