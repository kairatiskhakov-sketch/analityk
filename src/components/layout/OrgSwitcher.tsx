"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type Org = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: "OWNER" | "ADMIN" | "VIEWER";
  isCurrent: boolean;
};

export function OrgSwitcher() {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const r = await fetch("/api/orgs", { cache: "no-store" });
        const d = (await r.json()) as { orgs?: Org[] };
        if (!cancelled && d.orgs) setOrgs(d.orgs);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreateMode(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const current = orgs.find((o) => o.isCurrent) ?? orgs[0];

  async function switchOrg(orgId: string) {
    if (busy || orgId === current?.id) return;
    setBusy(true);
    try {
      const r = await fetch("/api/orgs/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      if (!r.ok) return;
      setOrgs((prev) => prev.map((o) => ({ ...o, isCurrent: o.id === orgId })));
      await updateSession();
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function createOrg() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = (await r.json()) as { org?: Org; error?: string };
      if (!r.ok || !d.org) return;
      const created: Org = { ...d.org, isCurrent: true };
      setOrgs((prev) => [
        ...prev.map((o) => ({ ...o, isCurrent: false })),
        created,
      ]);
      setNewName("");
      setCreateMode(false);
      await updateSession();
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-[10px] border px-3 py-2 text-left text-[13px] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
        style={{
          background: "rgba(255,255,255,0.03)",
          borderColor: "rgba(255,255,255,0.08)",
          color: "var(--text)",
        }}
      >
        <div
          className="flex h-6 w-6 items-center justify-center rounded-[6px] text-[11px] font-semibold"
          style={{ background: "linear-gradient(135deg, #7B5CF5, #E040FB)", color: "#fff" }}
        >
          {(current?.name || "?").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium" style={{ color: "var(--text)" }}>
            {loading ? "…" : current?.name ?? "Организация"}
          </p>
          <p className="truncate text-[10px]" style={{ color: "var(--hint)" }}>
            {current?.plan ?? "free"} · {current?.role?.toLowerCase() ?? ""}
          </p>
        </div>
        <span style={{ color: "var(--hint)", fontSize: 10 }}>▾</span>
      </button>

      {open ? (
        <div
          className="absolute left-0 right-0 top-[110%] z-50 rounded-[10px] border p-1.5 shadow-xl"
          style={{ background: "rgba(20,17,48,0.98)", borderColor: "rgba(255,255,255,0.1)" }}
        >
          <p
            className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em]"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            Мои организации
          </p>
          <div className="max-h-[240px] overflow-y-auto">
            {orgs.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => switchOrg(o.id)}
                disabled={busy}
                className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[rgba(255,255,255,0.06)] disabled:opacity-60"
                style={{ color: "var(--text)" }}
              >
                <div
                  className="flex h-5 w-5 items-center justify-center rounded-[4px] text-[10px] font-semibold"
                  style={{
                    background: o.isCurrent
                      ? "linear-gradient(135deg, #7B5CF5, #E040FB)"
                      : "rgba(255,255,255,0.08)",
                    color: "#fff",
                  }}
                >
                  {o.name.slice(0, 1).toUpperCase()}
                </div>
                <span className="flex-1 truncate">{o.name}</span>
                {o.isCurrent ? (
                  <span style={{ color: "#9B7FF8", fontSize: 10 }}>✓</span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="my-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />

          {createMode ? (
            <div className="space-y-1.5 p-1">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Название организации"
                className="w-full rounded-[6px] border px-2 py-1.5 text-[12px] outline-none"
                style={{
                  borderColor: "rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                  color: "var(--text)",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createOrg();
                  if (e.key === "Escape") {
                    setCreateMode(false);
                    setNewName("");
                  }
                }}
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={createOrg}
                  disabled={busy || !newName.trim()}
                  className="flex-1 rounded-[6px] py-1 text-[12px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{
                    background: "linear-gradient(135deg, #7B5CF5, #E040FB)",
                    color: "#fff",
                  }}
                >
                  Создать
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreateMode(false);
                    setNewName("");
                  }}
                  className="rounded-[6px] px-2 py-1 text-[12px]"
                  style={{ color: "var(--hint)" }}
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreateMode(true)}
              className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[rgba(255,255,255,0.06)]"
              style={{ color: "var(--text)" }}
            >
              <span style={{ color: "#9B7FF8" }}>＋</span>
              <span>Создать организацию</span>
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
