"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Status = "PENDING" | "ACTIVE" | "BLOCKED";

type Item = {
  id: string;
  name: string;
  email: string;
  status: Status;
  isPlatformAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  approvedAt: string | null;
  blockedAt: string | null;
  blockReason: string | null;
  orgCount: number;
};

type ListResp = {
  ok: true;
  items: Item[];
  total: number;
  page: number;
  limit: number;
  pages: number;
};

const STATUSES: Status[] = ["PENDING", "ACTIVE", "BLOCKED"];
const STATUS_LABEL: Record<Status, string> = {
  PENDING: "Ожидают",
  ACTIVE: "Активные",
  BLOCKED: "Заблокированы",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: Status }) {
  const styles: Record<Status, { bg: string; color: string; border: string }> = {
    PENDING: {
      bg: "rgba(251,191,36,0.12)",
      color: "#FBBF24",
      border: "rgba(251,191,36,0.3)",
    },
    ACTIVE: {
      bg: "rgba(34,197,94,0.12)",
      color: "#22C55E",
      border: "rgba(34,197,94,0.3)",
    },
    BLOCKED: {
      bg: "rgba(239,68,68,0.12)",
      color: "#EF4444",
      border: "rgba(239,68,68,0.3)",
    },
  };
  const s = styles[status];
  return (
    <span
      className="inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[11px] font-medium"
      style={{ background: s.bg, color: s.color, borderColor: s.border }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function UsersPanel({
  counts,
  initialStatus,
  initialQuery,
  initialPage,
}: {
  counts: Record<Status, number>;
  initialStatus: string;
  initialQuery: string;
  initialPage: number;
}) {
  const router = useRouter();
  const startStatus: Status = (STATUSES as string[]).includes(initialStatus)
    ? (initialStatus as Status)
    : "PENDING";

  const [status, setStatus] = useState<Status>(startStatus);
  const [q, setQ] = useState(initialQuery);
  const [debouncedQ, setDebouncedQ] = useState(initialQuery);
  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState<ListResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("status", status);
    if (debouncedQ) params.set("q", debouncedQ);
    params.set("page", String(page));
    params.set("limit", "50");
    fetch(`/api/admin/users?${params.toString()}`)
      .then((r) => r.json())
      .then((d: ListResp | { ok: false; error: string }) => {
        if (cancelled) return;
        if (!("ok" in d) || !d.ok) {
          setError(("error" in d && d.error) || "Ошибка загрузки");
          setData(null);
        } else {
          setData(d);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Сеть недоступна");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, debouncedQ, page]);

  const tabBtn = (s: Status) => {
    const active = s === status;
    return (
      <button
        key={s}
        type="button"
        onClick={() => {
          setStatus(s);
          setPage(1);
        }}
        className="rounded-[8px] px-3 py-1.5 text-[12px] transition-colors"
        style={{
          background: active ? "var(--surface2)" : "transparent",
          color: active ? "var(--text)" : "var(--muted)",
          border: `1px solid ${active ? "var(--border2)" : "transparent"}`,
        }}
      >
        {STATUS_LABEL[s]}{" "}
        <span style={{ color: "var(--hint)" }}>({counts[s]})</span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1
            className="text-[20px] font-semibold"
            style={{ color: "var(--text)" }}
          >
            Пользователи платформы
          </h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>
            Одобряйте новые регистрации, блокируйте при необходимости.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">{STATUSES.map(tabBtn)}</div>
        <input
          type="search"
          placeholder="Поиск по email или имени"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="w-[260px] rounded-[10px] border px-3 py-2 text-[13px] outline-none"
          style={{
            borderColor: "var(--border2)",
            background: "var(--surface2)",
            color: "var(--text)",
          }}
        />
      </div>

      {error ? (
        <div
          className="rounded-[8px] px-3 py-2 text-[12px]"
          style={{ background: "var(--red-bg)", color: "var(--red)" }}
        >
          {error}
        </div>
      ) : null}

      <div
        className="glass overflow-hidden rounded-[14px] border"
        style={{ borderColor: "var(--border)" }}
      >
        <table className="w-full text-[12px]">
          <thead>
            <tr
              className="border-b text-left"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              <th className="px-4 py-3 font-medium">Пользователь</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3 font-medium">Орг</th>
              <th className="px-4 py-3 font-medium">Регистрация</th>
              <th className="px-4 py-3 font-medium">Последний вход</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center"
                  style={{ color: "var(--muted)" }}
                >
                  Загрузка…
                </td>
              </tr>
            ) : !data || data.items.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center"
                  style={{ color: "var(--muted)" }}
                >
                  Пользователей в этом статусе нет.
                </td>
              </tr>
            ) : (
              data.items.map((u) => (
                <tr
                  key={u.id}
                  className="border-b transition-colors hover:bg-[var(--surface2)]"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="px-4 py-3">
                    <div
                      className="font-medium"
                      style={{ color: "var(--text)" }}
                    >
                      {u.name}
                      {u.isPlatformAdmin ? (
                        <span
                          className="ml-2 rounded-[5px] border px-1.5 py-0.5 text-[10px]"
                          style={{
                            color: "#9B7FF8",
                            borderColor: "rgba(155,127,248,0.4)",
                            background: "rgba(155,127,248,0.1)",
                          }}
                        >
                          super-admin
                        </span>
                      ) : null}
                    </div>
                    <div style={{ color: "var(--muted)" }}>{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text)" }}>
                    {u.orgCount}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                    {formatDate(u.createdAt)}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                    {formatDate(u.lastLoginAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="text-[12px]"
                      style={{ color: "var(--blue)" }}
                    >
                      Открыть →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 ? (
        <div
          className="flex items-center justify-between text-[12px]"
          style={{ color: "var(--muted)" }}
        >
          <div>
            Страница {data.page} из {data.pages} · всего {data.total}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={data.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-[8px] border px-3 py-1.5 disabled:opacity-40"
              style={{
                borderColor: "var(--border2)",
                background: "var(--surface2)",
                color: "var(--text)",
              }}
            >
              ← Назад
            </button>
            <button
              type="button"
              disabled={data.page >= data.pages}
              onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
              className="rounded-[8px] border px-3 py-1.5 disabled:opacity-40"
              style={{
                borderColor: "var(--border2)",
                background: "var(--surface2)",
                color: "var(--text)",
              }}
            >
              Вперёд →
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
