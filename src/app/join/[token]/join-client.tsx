"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Status = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
type Role = "OWNER" | "ADMIN" | "VIEWER";

type InviteInfo = {
  email: string;
  role: Role;
  status: Status;
  expiresAt: string;
  org: { id: string; name: string; slug: string };
};

type SessionInfo = {
  authenticated: boolean;
  userEmail: string | null;
  emailMatches: boolean;
};

const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  VIEWER: "Наблюдатель",
};

const STATUS_LABEL: Record<Status, string> = {
  PENDING: "Активное",
  ACCEPTED: "Уже принято",
  REVOKED: "Отозвано",
  EXPIRED: "Просрочено",
};

export function JoinClient({ token }: { token: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/invites/${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      const d = (await r.json()) as {
        ok?: boolean;
        invite?: InviteInfo;
        session?: SessionInfo;
        error?: string;
      };
      if (!r.ok || !d.ok || !d.invite) {
        setErr(d.error ?? "Приглашение не найдено");
        return;
      }
      setInvite(d.invite);
      setSession(d.session ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function accept() {
    if (!invite || accepting) return;
    setAccepting(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/invites/${encodeURIComponent(token)}/accept`,
        { method: "POST" },
      );
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) {
        setErr(d.error ?? "Не удалось принять приглашение");
        return;
      }
      setAccepted(true);
      setTimeout(() => router.push("/dashboard"), 800);
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: "#0a0a0a" }}
    >
      <div
        className="w-full max-w-md rounded-[18px] border p-6"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
        }}
      >
        <div className="mb-4 flex items-center gap-2">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-[12px] text-[18px] font-bold"
            style={{
              background: "linear-gradient(135deg, #7B5CF5, #E040FB)",
              color: "#ffffff",
            }}
          >
            S
          </div>
          <div>
            <p
              className="text-[18px] font-semibold leading-none"
              style={{ color: "var(--text)" }}
            >
              Приглашение
            </p>
            <p className="text-[11px]" style={{ color: "var(--hint)" }}>
              Saldo CRM
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-[13px]" style={{ color: "var(--muted)" }}>
            Проверяем приглашение…
          </p>
        ) : err ? (
          <ErrorBox message={err} />
        ) : invite ? (
          <Body
            invite={invite}
            session={session}
            accepting={accepting}
            accepted={accepted}
            onAccept={accept}
            token={token}
          />
        ) : null}
      </div>
    </div>
  );
}

function Body({
  invite,
  session,
  accepting,
  accepted,
  onAccept,
  token,
}: {
  invite: InviteInfo;
  session: SessionInfo | null;
  accepting: boolean;
  accepted: boolean;
  onAccept: () => void;
  token: string;
}) {
  const badRoleStatus = invite.status !== "PENDING";

  return (
    <div className="space-y-4">
      <div
        className="rounded-[12px] border p-3"
        style={{ borderColor: "var(--border)", background: "var(--bg)" }}
      >
        <p
          className="text-[11px] font-medium uppercase tracking-wide"
          style={{ color: "var(--hint)" }}
        >
          Организация
        </p>
        <p
          className="mt-1 text-[15px] font-semibold"
          style={{ color: "var(--text)" }}
        >
          {invite.org.name}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
          <div>
            <p style={{ color: "var(--hint)" }}>Email</p>
            <p style={{ color: "var(--text)" }}>{invite.email}</p>
          </div>
          <div>
            <p style={{ color: "var(--hint)" }}>Роль</p>
            <p style={{ color: "var(--text)" }}>{ROLE_LABEL[invite.role]}</p>
          </div>
          <div>
            <p style={{ color: "var(--hint)" }}>Статус</p>
            <p
              style={{
                color:
                  invite.status === "PENDING"
                    ? "var(--green, #00E676)"
                    : "var(--red)",
              }}
            >
              {STATUS_LABEL[invite.status]}
            </p>
          </div>
          <div>
            <p style={{ color: "var(--hint)" }}>Действует до</p>
            <p style={{ color: "var(--text)" }}>
              {new Date(invite.expiresAt).toLocaleString("ru-RU")}
            </p>
          </div>
        </div>
      </div>

      {badRoleStatus ? (
        <ErrorBox
          message={
            invite.status === "ACCEPTED"
              ? "Приглашение уже принято. Войдите в свой аккаунт."
              : invite.status === "REVOKED"
                ? "Приглашение отозвано владельцем организации."
                : "Срок действия приглашения истёк. Попросите выслать новое."
          }
        />
      ) : !session?.authenticated ? (
        <div className="space-y-2">
          <p className="text-[12px]" style={{ color: "var(--muted)" }}>
            Чтобы принять приглашение, войдите в аккаунт с email{" "}
            <span style={{ color: "var(--text)" }}>{invite.email}</span>. Если
            аккаунта ещё нет — сначала зарегистрируйтесь.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(`/join/${token}`)}`}
            className="inline-block rounded-[10px] px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, #7B5CF5, #E040FB)",
              color: "#fff",
            }}
          >
            Войти / зарегистрироваться →
          </Link>
        </div>
      ) : !session.emailMatches ? (
        <ErrorBox
          message={`Вы вошли как ${session.userEmail}, а приглашение выписано на ${invite.email}. Выйдите и войдите под нужным аккаунтом.`}
        />
      ) : accepted ? (
        <div
          className="rounded-[10px] border px-3 py-2 text-[12px]"
          style={{ borderColor: "#00E676", color: "#00E676" }}
        >
          Приглашение принято. Переходим в дашборд…
        </div>
      ) : (
        <button
          type="button"
          onClick={onAccept}
          disabled={accepting}
          className="w-full rounded-[10px] px-4 py-2.5 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{
            background: "linear-gradient(135deg, #7B5CF5, #E040FB)",
            color: "#fff",
          }}
        >
          {accepting ? "Принимаем…" : "Принять приглашение"}
        </button>
      )}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      className="rounded-[10px] border px-3 py-2 text-[12px]"
      style={{ borderColor: "var(--red)", color: "var(--red)" }}
    >
      {message}
    </div>
  );
}
