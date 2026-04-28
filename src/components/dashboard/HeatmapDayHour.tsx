"use client";

import { useMemo, useState } from "react";

const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const HOURS = 24;

type HeatCell = { day: number; hour: number; value: number };

export function HeatmapDayHour({
  data,
  total,
  emptyHint,
  accent = "var(--accent)",
}: {
  data: number[][];
  total: number;
  emptyHint?: string;
  accent?: string;
}) {
  const [hover, setHover] = useState<HeatCell | null>(null);

  const max = useMemo(() => {
    let m = 0;
    for (const row of data) for (const v of row) if (v > m) m = v;
    return m;
  }, [data]);

  if (total === 0) {
    return (
      <p className="px-4 py-8 text-center text-[12px]" style={{ color: "var(--hint)" }}>
        {emptyHint ?? "Нет данных за период"}
      </p>
    );
  }

  // Пиковый час (по сумме за все дни)
  const hourTotals = useMemo(() => {
    const arr = new Array<number>(HOURS).fill(0);
    for (let d = 0; d < data.length; d++) {
      for (let h = 0; h < HOURS; h++) arr[h] += data[d][h] ?? 0;
    }
    return arr;
  }, [data]);
  const peakHour = hourTotals.indexOf(Math.max(...hourTotals));

  return (
    <div className="px-4 pb-4">
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Шкала часов */}
          <div className="flex pl-7">
            {Array.from({ length: HOURS }, (_, h) => (
              <div
                key={h}
                className="text-center text-[9px]"
                style={{
                  width: 16,
                  color: h === peakHour ? "var(--accent)" : "var(--hint)",
                  fontWeight: h === peakHour ? 600 : 400,
                }}
              >
                {h % 3 === 0 ? h : ""}
              </div>
            ))}
          </div>

          {/* Сетка */}
          {DAY_LABELS.map((label, dayIdx) => (
            <div key={label} className="flex items-center">
              <div
                className="pr-1 text-right text-[10px]"
                style={{ width: 28, color: "var(--muted)" }}
              >
                {label}
              </div>
              {Array.from({ length: HOURS }, (_, h) => {
                const v = data[dayIdx]?.[h] ?? 0;
                const intensity = max > 0 ? v / max : 0;
                const isHover =
                  hover && hover.day === dayIdx && hover.hour === h;
                return (
                  <div
                    key={h}
                    onMouseEnter={() => setHover({ day: dayIdx, hour: h, value: v })}
                    onMouseLeave={() => setHover(null)}
                    className="m-[1px] cursor-pointer rounded-[2px] transition-transform"
                    style={{
                      width: 14,
                      height: 14,
                      background:
                        v === 0
                          ? "rgba(255,255,255,0.04)"
                          : accent,
                      opacity: v === 0 ? 1 : 0.18 + intensity * 0.82,
                      outline: isHover ? "1px solid rgba(255,255,255,0.6)" : "none",
                      transform: isHover ? "scale(1.4)" : "scale(1)",
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Hover info / легенда */}
      <div className="mt-3 flex items-center justify-between text-[11px]">
        <div style={{ color: "var(--muted)", minHeight: 16 }}>
          {hover
            ? `${DAY_LABELS[hover.day]} ${String(hover.hour).padStart(2, "0")}:00 — ${hover.value}`
            : `Пик: ${DAY_LABELS[hourTotals.indexOf(0) >= 0 ? 0 : 0]} в ${String(peakHour).padStart(2, "0")}:00 · всего ${total}`}
        </div>
        <div className="flex items-center gap-1">
          <span style={{ color: "var(--hint)" }}>меньше</span>
          {[0.18, 0.4, 0.6, 0.8, 1].map((op) => (
            <span
              key={op}
              className="rounded-[2px]"
              style={{ width: 12, height: 12, background: accent, opacity: op }}
            />
          ))}
          <span style={{ color: "var(--hint)" }}>больше</span>
        </div>
      </div>
    </div>
  );
}
