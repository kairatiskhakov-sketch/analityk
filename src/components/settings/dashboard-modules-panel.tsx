"use client";

import { useState } from "react";
import { MODULES, type ModulePage } from "@/lib/modules/config";
import { useModules } from "@/hooks/useModules";

const PAGE_LABEL: Record<ModulePage, string> = {
  dashboard: "Дашборд",
  managers: "Менеджеры",
  leads: "Лиды",
  products: "Товары (новые модули)",
  regions: "Регионы",
};

function groupByPage(): [ModulePage, typeof MODULES[number][]][] {
  const order: ModulePage[] = [
    "dashboard",
    "managers",
    "leads",
    "products",
    "regions",
  ];
  const map = new Map<ModulePage, typeof MODULES[number][]>();
  for (const m of MODULES) {
    const arr = map.get(m.page) ?? [];
    arr.push(m);
    map.set(m.page, arr);
  }
  return order.filter((p) => map.has(p)).map((p) => [p, map.get(p)!]);
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50"
      style={{
        background: checked ? "var(--accent)" : "var(--border2)",
      }}
    >
      <span
        className="absolute top-0.5 h-5 w-5 rounded-full shadow transition-transform"
        style={{
          left: checked ? "calc(100% - 1.375rem)" : "2px",
          background: checked ? "#000000" : "#ffffff",
        }}
      />
    </button>
  );
}

export function DashboardModulesPanel() {
  const { isEnabled, toggle, isLoading } = useModules();
  const [busy, setBusy] = useState<string | null>(null);
  const groups = groupByPage();

  async function onToggle(key: (typeof MODULES)[number]["key"], next: boolean) {
    setBusy(key);
    try {
      await toggle(key, next);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="max-w-2xl rounded-[12px] border p-5"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      <h2
        className="text-[15px] font-medium tracking-tight"
        style={{ color: "var(--text)" }}
      >
        Модули дашборда
      </h2>
      <p className="mt-0.5 text-[12px]" style={{ color: "var(--hint)" }}>
        Включай только нужные блоки
      </p>

      <div className="mt-4 space-y-5">
        {groups.map(([page, mods]) => (
          <div key={page}>
            <p
              className="mb-2 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--hint)" }}
            >
              {PAGE_LABEL[page]}
            </p>
            <div className="space-y-2">
              {mods.map((m) => {
                const on = isEnabled(m.key);
                const loading = isLoading || busy === m.key;
                return (
                  <div
                    key={m.key}
                    className="flex items-center justify-between gap-3 rounded-[9px] border px-3 py-2"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="text-[13px]" style={{ color: "var(--text)" }}>
                      {m.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[11px]"
                        style={{ color: "var(--muted)" }}
                      >
                        {on ? "включён" : "выключен"}
                      </span>
                      <Toggle
                        checked={on}
                        disabled={loading}
                        onChange={(v) => onToggle(m.key, v)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
