"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui";
import { formatCurrency, formatNumber } from "@/lib/utils";

type PlatformAgg = {
  platform: "META" | "TIKTOK" | "GOOGLE";
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
  platform: "META" | "TIKTOK" | "GOOGLE";
  spend: number;
  leads: number;
  attributedDeals: number;
  cpl: number | null;
  cpDeal: number | null;
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
  };
  byPlatform?: PlatformAgg[];
  byCampaign?: CampaignAgg[];
  error?: string;
};

const PLATFORM_LABEL: Record<PlatformAgg["platform"], string> = {
  META: "Meta",
  TIKTOK: "TikTok",
  GOOGLE: "Google",
};

function fmtMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${formatCurrency(v)} ₸`;
}

export function AdsRoiWidget({
  dateFrom,
  dateTo,
}: {
  dateFrom: string;
  dateTo: string;
}) {
  const [data, setData] = useState<RoiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const q = new URLSearchParams({ from: dateFrom, to: dateTo });
        const res = await fetch(`/api/ads/roi?${q}`, { cache: "no-store" });
        const json = (await res.json()) as RoiResponse;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) {
          setData({ ok: false, error: e instanceof Error ? e.message : "Ошибка" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo]);

  if (loading) {
    return (
      <Card>
        <CardHeader title="ROI рекламы" sub="Загрузка…" />
        <div
          className="h-10 rounded-[10px]"
          style={{ background: "var(--border)" }}
        />
      </Card>
    );
  }

  if (!data?.ok || !data.overall) {
    return (
      <Card>
        <CardHeader title="ROI рекламы" />
        <p className="text-[12px]" style={{ color: "var(--muted)" }}>
          {data?.error ?? "Нет данных за выбранный период."}
        </p>
      </Card>
    );
  }

  const { overall, byPlatform = [], byCampaign = [] } = data;
  const topCampaigns = expanded ? byCampaign : byCampaign.slice(0, 5);
  const hasAny =
    overall.spend > 0 || overall.leads > 0 || overall.attributedDeals > 0;

  return (
    <Card>
      <CardHeader
        title="ROI рекламы"
        sub={`${data.range?.from ?? ""} — ${data.range?.to ?? ""}`}
      />

      {!hasAny ? (
        <p className="text-[12px]" style={{ color: "var(--muted)" }}>
          За выбранный период нет расходов или атрибутированных сделок. Проверьте,
          что рекламные кабинеты подключены и синхронизированы.
        </p>
      ) : (
        <>
          {/* Overall KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <RoiKpi label="Расход" value={fmtMoney(overall.spend)} />
            <RoiKpi label="Лиды (площадки)" value={formatNumber(overall.leads)} />
            <RoiKpi
              label="Сделки (атриб.)"
              value={formatNumber(overall.attributedDeals)}
            />
            <RoiKpi label="CPL" value={fmtMoney(overall.cpl)} />
            <RoiKpi label="Цена сделки" value={fmtMoney(overall.cpDeal)} />
          </div>

          {/* By platform */}
          {byPlatform.length > 0 ? (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr
                    className="text-left"
                    style={{ color: "var(--muted)" }}
                  >
                    <th className="pb-2 font-medium">Платформа</th>
                    <th className="pb-2 text-right font-medium">Расход</th>
                    <th className="pb-2 text-right font-medium">Клики</th>
                    <th className="pb-2 text-right font-medium">Лиды</th>
                    <th className="pb-2 text-right font-medium">Сделки</th>
                    <th className="pb-2 text-right font-medium">CPL</th>
                    <th className="pb-2 text-right font-medium">Цена сделки</th>
                  </tr>
                </thead>
                <tbody>
                  {byPlatform.map((p) => (
                    <tr
                      key={p.platform}
                      className="border-t"
                      style={{ borderColor: "rgba(255,255,255,0.05)" }}
                    >
                      <td className="py-2" style={{ color: "var(--text)" }}>
                        {PLATFORM_LABEL[p.platform]}
                      </td>
                      <td className="py-2 text-right">{fmtMoney(p.spend)}</td>
                      <td className="py-2 text-right">{formatNumber(p.clicks)}</td>
                      <td className="py-2 text-right">{formatNumber(p.leads)}</td>
                      <td className="py-2 text-right">
                        {formatNumber(p.attributedDeals)}
                      </td>
                      <td className="py-2 text-right">{fmtMoney(p.cpl)}</td>
                      <td className="py-2 text-right">{fmtMoney(p.cpDeal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {/* Top campaigns */}
          {byCampaign.length > 0 ? (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <p
                  className="text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--hint)" }}
                >
                  Топ кампаний
                </p>
                {byCampaign.length > 5 ? (
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="text-[11px]"
                    style={{ color: "var(--blue)" }}
                  >
                    {expanded ? "Свернуть" : `Показать все (${byCampaign.length})`}
                  </button>
                ) : null}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr
                      className="text-left"
                      style={{ color: "var(--muted)" }}
                    >
                      <th className="pb-2 font-medium">Кампания</th>
                      <th className="pb-2 font-medium">Платформа</th>
                      <th className="pb-2 text-right font-medium">Расход</th>
                      <th className="pb-2 text-right font-medium">Лиды</th>
                      <th className="pb-2 text-right font-medium">Сделки</th>
                      <th className="pb-2 text-right font-medium">CPL</th>
                      <th className="pb-2 text-right font-medium">Цена сделки</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCampaigns.map((c) => (
                      <tr
                        key={c.campaignId}
                        className="border-t"
                        style={{ borderColor: "rgba(255,255,255,0.05)" }}
                      >
                        <td
                          className="max-w-[240px] truncate py-2"
                          style={{ color: "var(--text)" }}
                          title={c.name}
                        >
                          {c.name}
                        </td>
                        <td
                          className="py-2"
                          style={{ color: "var(--muted)" }}
                        >
                          {PLATFORM_LABEL[c.platform]}
                        </td>
                        <td className="py-2 text-right">{fmtMoney(c.spend)}</td>
                        <td className="py-2 text-right">
                          {formatNumber(c.leads)}
                        </td>
                        <td className="py-2 text-right">
                          {formatNumber(c.attributedDeals)}
                        </td>
                        <td className="py-2 text-right">{fmtMoney(c.cpl)}</td>
                        <td className="py-2 text-right">{fmtMoney(c.cpDeal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

// Внешний компонент — не inline-функция (rerender-no-inline-components)
function RoiKpi({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-[12px] border px-3 py-2"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      <p
        className="text-[10px] font-medium uppercase tracking-wide"
        style={{ color: "var(--hint)" }}
      >
        {label}
      </p>
      <p
        className="mt-1 text-[16px] font-semibold"
        style={{ color: "var(--text)" }}
      >
        {value}
      </p>
    </div>
  );
}
