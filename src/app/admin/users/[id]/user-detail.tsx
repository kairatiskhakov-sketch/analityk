"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = "PENDING" | "ACTIVE" | "BLOCKED";
type OrgRole = "OWNER" | "ADMIN" | "VIEWER";

type Actor = { id: string; name: string; email: string } | null;

export type UserDetailData = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER";
  status: Status;
  isPlatformAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  approvedAt: string | null;
  approvedBy: Actor;
  blockedAt: string | null;
  blockedBy: Actor;
  blockReason: string | null;
  orgs: Array<{
    membershipId: string;
    role: OrgRole;
    joinedAt: string;
    org: { id: string; name: string; slug: string; plan: string };
  }>;
};

export type AuditEntry = {
  id: string;
  action: string;
  createdAt: string;
  details: Record<string, unknown> | null;
  actor: Actor;
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

const STATUS_LABEL: Record<Status, string> = {
  PENDING: "Ожидает",
  ACTIVE: "Активен",
  BLOCKED: "Заблокирован",
};

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

export function UserDetail({
  user,
  audits,
}: {
  user: UserDetailData;
  audits: AuditEntry[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "approve" | "block" | "unblock">(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function call(action: "approve" | "block" | "unblock", body?: unknown) {
    setBusy(action);
    setError(null);
    try {
      const r = await fetch(`/api/admin/users/${user.id}/${action}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !data.ok) {
        setError(data.error ?? "Ошибка операции");
        return;
      }
      router.refresh();
      setBlockOpen(false);
      setBlockReason("");
    } catch {
      setError("Сеть недоступна");
    } finally {
      setBusy(null);
    }
  }

  const Action = ({
    label,
    onClick,
    variant = "primary",
    disabled,
  }: {
    label: string;
    onClick: () => void;
    variant?: "primary" | "danger" | "secondary";
    disabled?: boolean;
  }) => {
    const styles =
      variant === "danger"
        ? { background: "linear-gradient(135deg,#EF4444,#B91C1C)", color: "#fff" }
        : variant === "secondary"
          ? { background: "var(--surface2)", color: "var(--text)" }
          : { background: "linear-gradient(135deg,#7B5CF5,#E040FB)", color: "#fff" };
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="rounded-[10px] px-4 py-2 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
        style={styles}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div
        className="glass rounded-[14px] border p-5"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2
                className="text-[18px] font-semibold"
                style={{ color: "var(--text)" }}
              >
                {user.name}
              </h2>
              <StatusBadge status={user.status} />
              {user.isPlatformAdmin ? (
                <span
                  className="rounded-[5px] border px-1.5 py-0.5 text-[10px]"
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
            <div
              className="mt-1 text-[13px]"
              style={{ color: "var(--muted)" }}
            >
              {user.email}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {user.status === "PENDING" ? (
              <Action
                label={busy === "approve" ? "…" : "Одобрить"}
                onClick={() => call("approve")}
                disabled={busy !== null}
              />
            ) : null}
            {user.status === "ACTIVE" && !user.isPlatformAdmin ? (
              <Action
                label="Заблокировать"
                variant="danger"
                onClick={() => setBlockOpen(true)}
                disabled={busy !== null}
              />
            ) : null}
            {user.status === "BLOCKED" ? (
              <Action
                label={busy === "unblock" ? "…" : "Разблокировать"}
                onClick={() => call("unblock")}
                disabled={busy !== null}
              />
            ) : null}
          </div>
        </div>

        {error ? (
          <div
            className="mb-3 rounded-[8px] px-3 py-2 text-[12px]"
            style={{ background: "var(--red-bg)", color: "var(--red)" }}
          >
            {error}
          </div>
        ) : null}

        <dl
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          style={{ color: "var(--text)" }}
        >
          <Field label="Регистрация" value={formatDate(user.createdAt)} />
          <Field label="Последний вход" value={formatDate(user.lastLoginAt)} />
          <Field label="Роль (legacy)" value={user.role} />
          <Field
            label="Одобрено"
            value={
              user.approvedAt
                ? `${formatDate(user.approvedAt)}${
                    user.approvedBy ? ` · ${user.approvedBy.name}` : ""
                  }`
                : "—"
            }
          />
          {user.status === "BLOCKED" ? (
            <>
              <Field
                label="Заблокировано"
                value={
                  user.blockedAt
                    ? `${formatDate(user.blockedAt)}${
                        user.blockedBy ? ` · ${user.blockedBy.name}` : ""
                      }`
                    : "—"
                }
              />
              <Field
                label="Причина"
                value={user.blockReason ?? "—"}
              />
            </>
          ) : null}
        </dl>
      </div>

      {/* Орги */}
      <div
        className="glass rounded-[14px] border p-5"
        style={{ borderColor: "var(--border)" }}
      >
        <h3
          className="mb-3 text-[14px] font-semibold"
          style={{ color: "var(--text)" }}
        >
          Организации ({user.orgs.length})
        </h3>
        {user.orgs.length === 0 ? (
          <div className="text-[12px]" style={{ color: "var(--muted)" }}>
            Не состоит ни в одной организации.
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr
                className="border-b text-left"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              >
                <th className="px-2 py-2 font-medium">Организация</th>
                <th className="px-2 py-2 font-medium">Slug</th>
                <th className="px-2 py-2 font-medium">План</th>
                <th className="px-2 py-2 font-medium">Роль</th>
                <th className="px-2 py-2 font-medium">Вступил</th>
              </tr>
            </thead>
            <tbody>
              {user.orgs.map((m) => (
                <tr
                  key={m.membershipId}
                  className="border-b"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td
                    className="px-2 py-2 font-medium"
                    style={{ color: "var(--text)" }}
                  >
                    {m.org.name}
                  </td>
                  <td className="px-2 py-2" style={{ color: "var(--muted)" }}>
                    {m.org.slug}
                  </td>
                  <td className="px-2 py-2" style={{ color: "var(--text)" }}>
                    {m.org.plan}
                  </td>
                  <td className="px-2 py-2" style={{ color: "var(--text)" }}>
                    {m.role}
                  </td>
                  <td className="px-2 py-2" style={{ color: "var(--muted)" }}>
                    {formatDate(m.joinedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Аудит */}
      <div
        className="glass rounded-[14px] border p-5"
        style={{ borderColor: "var(--border)" }}
      >
        <h3
          className="mb-3 text-[14px] font-semibold"
          style={{ color: "var(--text)" }}
        >
          История действий ({audits.length})
        </h3>
        {audits.length === 0 ? (
          <div className="text-[12px]" style={{ color: "var(--muted)" }}>
            Нет записей.
          </div>
        ) : (
          <ul className="space-y-2">
            {audits.map((a) => (
              <li
                key={a.id}
                className="rounded-[8px] border px-3 py-2 text-[12px]"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface2)",
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="font-medium"
                    style={{ color: "var(--text)" }}
                  >
                    {a.action}
                  </span>
                  <span style={{ color: "var(--muted)" }}>
                    {formatDate(a.createdAt)}
                  </span>
                </div>
                <div className="mt-1" style={{ color: "var(--muted)" }}>
                  {a.actor ? `${a.actor.name} (${a.actor.email})` : "Система"}
                </div>
                {a.details && Object.keys(a.details).length > 0 ? (
                  <pre
                    className="mt-1 overflow-x-auto rounded-[6px] p-2 text-[11px]"
                    style={{
                      background: "var(--bg)",
                      color: "var(--hint)",
                    }}
                  >
                    {JSON.stringify(a.details, null, 2)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Block dialog */}
      {blockOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => !busy && setBlockOpen(false)}
        >
          <div
            className="glass w-full max-w-[440px] rounded-[14px] border p-5"
            style={{ borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              className="mb-3 text-[15px] font-semibold"
              style={{ color: "var(--text)" }}
            >
              Заблокировать пользователя
            </h3>
            <p
              className="mb-3 text-[12px] leading-relaxed"
              style={{ color: "var(--muted)" }}
            >
              Пользователь {user.email} не сможет войти в систему. Письмо с
              уведомлением будет отправлено.
            </p>
            <label
              className="mb-1 block text-[11px] font-medium uppercase tracking-[0.1em]"
              style={{ color: "var(--muted)" }}
            >
              Причина (опционально, видна пользователю)
            </label>
            <textarea
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              rows={3}
              maxLength={500}
              className="mb-4 w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none"
              style={{
                borderColor: "var(--border2)",
                background: "var(--surface2)",
                color: "var(--text)",
              }}
            />
            <div className="flex justify-end gap-2">
              <Action
                label="Отмена"
                variant="secondary"
                onClick={() => setBlockOpen(false)}
                disabled={busy !== null}
              />
              <Action
                label={busy === "block" ? "…" : "Заблокировать"}
                variant="danger"
                onClick={() =>
                  call("block", blockReason.trim() ? { reason: blockReason.trim() } : {})
                }
                disabled={busy !== null}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="text-[10px] uppercase tracking-[0.1em]"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </div>
      <div className="text-[13px]" style={{ color: "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}
