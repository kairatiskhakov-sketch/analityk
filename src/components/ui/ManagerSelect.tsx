"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type ManagerOption = { id: string; name: string };

/** Аватары: основной — акцент; остальные — приглушённые */
const AVATAR_BG = [
  "var(--accent)",
  "var(--blue)",
  "#888888",
  "var(--amber)",
  "#4488ff",
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    const w = parts[0];
    return w.length >= 2 ? w.slice(0, 2).toUpperCase() : w.toUpperCase();
  }
  const a = parts[0][0] ?? "";
  const b = parts[1][0] ?? "";
  return (a + b).toUpperCase();
}

function abbreviateName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

function orderIdsByManagers(ids: string[], managers: ManagerOption[]): string[] {
  const set = new Set(ids);
  const ordered: string[] = [];
  for (const m of managers) {
    if (set.has(m.id)) ordered.push(m.id);
  }
  if (ordered.length === ids.length) return ordered;
  return ids;
}

function formatTriggerLabel(selected: string[], managers: ManagerOption[]): string {
  if (selected.length === 0) return "Все менеджеры";
  const byId = new Map(managers.map((m) => [m.id, m]));
  const ordered = orderIdsByManagers(selected, managers);
  if (ordered.length === 1) {
    const n = byId.get(ordered[0])?.name ?? "";
    return abbreviateName(n);
  }
  const firstTwo = ordered.slice(0, 2).map((id) =>
    abbreviateName(byId.get(id)?.name ?? ""),
  );
  const rest = ordered.length - 2;
  return rest > 0
    ? `${firstTwo.join(", ")} +${rest}`
    : firstTwo.join(", ");
}

type Props = {
  managers: ManagerOption[];
  /** Пустой массив = все менеджеры */
  selected: string[];
  onChange: (ids: string[]) => void;
  className?: string;
};

export function ManagerSelect({ managers, selected, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setDraft(selected.slice());
      setQuery("");
    }
    wasOpenRef.current = open;
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const el = rootRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return managers;
    return managers.filter((m) => m.name.toLowerCase().includes(q));
  }, [managers, query]);

  const toggleAll = useCallback(() => {
    setDraft([]);
  }, []);

  const toggleOne = useCallback((id: string) => {
    setDraft((prev) => {
      if (prev.length === 0) return [id];
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        return next;
      }
      return [...prev, id];
    });
  }, []);

  const apply = useCallback(() => {
    onChange(draft.slice());
    setOpen(false);
  }, [draft, onChange]);

  const reset = useCallback(() => {
    setDraft([]);
    onChange([]);
    setOpen(false);
  }, [onChange]);

  const allChecked = draft.length === 0;

  return (
    <div ref={rootRef} className={cn("relative min-w-[200px]", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-left transition-colors"
        style={{
          border: "1px solid var(--border2)",
          borderRadius: "12px",
          padding: "6px 12px",
          fontSize: 13,
          background: "var(--surface)",
          color: "var(--text)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--surface2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--surface)";
        }}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-[14px]" aria-hidden>
            👤
          </span>
          <span className="truncate font-normal">
            {formatTriggerLabel(selected, managers)}
          </span>
        </span>
        <span className="shrink-0 text-[10px] opacity-60" aria-hidden>
          ▼
        </span>
      </button>

      {open ? (
        <div
          className="absolute left-0 top-full z-50 mt-1 flex flex-col"
          style={{
            background: "var(--surface2)",
            border: "1px solid var(--border2)",
            borderRadius: "12px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
            padding: 8,
            minWidth: 260,
            maxHeight: 360,
          }}
        >
          <input
            type="search"
            placeholder="🔍 Поиск менеджера..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full outline-none"
            style={{
              border: "1px solid var(--border2)",
              borderRadius: "8px",
              padding: "6px 10px",
              fontSize: 12,
              marginBottom: 6,
              background: "var(--surface)",
              color: "var(--text)",
            }}
            autoComplete="off"
            autoFocus
          />

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            style={{ maxHeight: 260 }}
          >
            <label
              className="flex cursor-pointer items-center gap-2"
              style={{
                padding: "7px 8px",
                borderRadius: "var(--r-sm)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#222222";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <input
                type="checkbox"
                checked={allChecked}
                onChange={() => toggleAll()}
                className="h-3.5 w-3.5 shrink-0 rounded border"
                style={{ accentColor: "var(--accent)" }}
              />
              <span className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
                Все менеджеры
              </span>
            </label>

            <div
              className="my-1"
              style={{ borderTop: "1px solid var(--border)" }}
            />

            {filtered.map((m) => {
              const checked = draft.length === 0 ? false : draft.includes(m.id);
              const origIdx = managers.findIndex((x) => x.id === m.id);
              const bg = AVATAR_BG[
                (origIdx >= 0 ? origIdx : 0) % AVATAR_BG.length
              ];
              return (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-center gap-2"
                  style={{
                    padding: "7px 8px",
                    borderRadius: "var(--r-sm)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#222222";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOne(m.id)}
                    className="h-3.5 w-3.5 shrink-0 rounded border"
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                    style={{
                      background: bg,
                      color: bg === "var(--accent)" ? "#000000" : "#fff",
                    }}
                  >
                    {getInitials(m.name)}
                  </span>
                  <span className="min-w-0 flex-1 text-[13px]" style={{ color: "var(--text)" }}>
                    {m.name}
                  </span>
                </label>
              );
            })}
          </div>

          <div
            className="mt-2 flex items-center justify-between gap-2 border-t pt-2"
            style={{ borderColor: "var(--border)" }}
          >
            <button
              type="button"
              className="rounded-[7px] px-3 py-1.5 text-[12px] font-medium transition-opacity hover:opacity-80"
              style={{ color: "var(--muted)" }}
              onClick={reset}
            >
              Сбросить
            </button>
            <button
              type="button"
              className="rounded-[8px] px-3 py-1.5 text-[12px] font-semibold"
              style={{ background: "var(--accent)", color: "#000000" }}
              onClick={apply}
            >
              Применить
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
