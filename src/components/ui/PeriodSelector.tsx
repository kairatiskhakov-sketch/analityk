"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type Period,
  computeRangeForPreset,
  toYMD,
} from "@/lib/dashboard/range";

const PRESETS: { id: Period; label: string }[] = [
  { id: "today", label: "Сегодня" },
  { id: "week", label: "7 дней" },
];

type Props = {
  /** Если задан — при смене периода делается router.push с query */
  basePath?: "/dashboard" | "/dashboard/leads" | "/dashboard/managers";
  initialPreset: Period;
  initialDateFrom: string;
  initialDateTo: string;
};

export function PeriodSelector({
  basePath,
  initialPreset,
  initialDateFrom,
  initialDateTo,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selected, setSelected] = useState<Period>(initialPreset);
  const [customFrom, setCustomFrom] = useState<string>(
    initialPreset === "custom" ? initialDateFrom : "",
  );
  const [customTo, setCustomTo] = useState<string>(
    initialPreset === "custom" ? initialDateTo : "",
  );
  const [isOpen, setIsOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelected(initialPreset);
    if (initialPreset === "custom") {
      setCustomFrom(initialDateFrom);
      setCustomTo(initialDateTo);
    }
  }, [initialPreset, initialDateFrom, initialDateTo]);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [isOpen]);

  function pushRange(preset: Period, from: Date, to: Date) {
    const q = new URLSearchParams(searchParams.toString());
    q.set("preset", preset);
    q.set("dateFrom", toYMD(from));
    q.set("dateTo", toYMD(to));
    const path = basePath ?? pathname;
    router.push(`${path}?${q.toString()}`);
    router.refresh();
  }

  function applyPreset(preset: Period) {
    setSelected(preset);
    if (preset === "custom") {
      setIsOpen(true);
      return;
    }
    const { start, end } = computeRangeForPreset(preset, null, null);
    pushRange(preset, start, end);
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    const a = new Date(`${customFrom}T00:00:00`);
    const b = new Date(`${customTo}T00:00:00`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return;
    const { start, end } = computeRangeForPreset("custom", a, b);
    setSelected("custom");
    setIsOpen(false);
    pushRange("custom", start, end);
  }

  const pillClass = (active: boolean) =>
    `rounded-[8px] px-2.5 py-1.5 text-[11.5px] font-semibold transition-all whitespace-nowrap ${
      active ? "" : ""
    }`;

  return (
    <div
      className="relative flex flex-wrap items-center gap-1 rounded-[10px] p-1"
      style={{ background: "var(--surface2)" }}
    >
      {PRESETS.map(({ id, label }) => {
        const active = selected === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => applyPreset(id)}
            className={pillClass(active)}
            style={{
              background: active ? "var(--accent)" : "transparent",
              color: active ? "#000000" : "var(--muted)",
              border: "none",
            }}
          >
            {label}
          </button>
        );
      })}

      <div className="relative" ref={popRef}>
        <button
          type="button"
          onClick={() => {
            setIsOpen((v) => !v);
            if (selected !== "custom") {
              setCustomFrom(initialDateFrom);
              setCustomTo(initialDateTo);
            }
          }}
          className={pillClass(selected === "custom")}
          style={{
            background: selected === "custom" ? "var(--accent)" : "transparent",
            color: selected === "custom" ? "#000000" : "var(--muted)",
            border: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden
          >
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
          Свой период
        </button>

        {isOpen ? (
          <div
            className="absolute right-0 top-full z-20 mt-2 w-[min(100vw-2rem,280px)] rounded-[12px] border p-4 shadow-lg"
            style={{
              background: "var(--surface2)",
              borderColor: "var(--border2)",
            }}
          >
            <p
              className="mb-3 text-[11px] font-medium uppercase tracking-wide"
              style={{ color: "var(--hint)" }}
            >
              Диапазон дат
            </p>
            <div className="space-y-2">
              <div>
                <label
                  className="mb-0.5 block text-[10px]"
                  style={{ color: "var(--hint)" }}
                >
                  С
                </label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full rounded-[8px] border px-2 py-1.5 text-[13px]"
                  style={{
                    borderColor: "var(--border2)",
                    background: "var(--surface)",
                    color: "var(--text)",
                  }}
                />
              </div>
              <div>
                <label
                  className="mb-0.5 block text-[10px]"
                  style={{ color: "var(--hint)" }}
                >
                  По
                </label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full rounded-[8px] border px-2 py-1.5 text-[13px]"
                  style={{
                    borderColor: "var(--border2)",
                    background: "var(--surface)",
                    color: "var(--text)",
                  }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={applyCustom}
              className="mt-3 w-full rounded-[8px] py-2 text-[13px] font-semibold"
              style={{ background: "var(--accent)", color: "#000000" }}
            >
              Применить
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
