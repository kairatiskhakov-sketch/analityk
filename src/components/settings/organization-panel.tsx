"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Role = "OWNER" | "ADMIN" | "VIEWER";

type OrgInfo = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: Role;
  isCurrent: boolean;
};

type Member = {
  id: string;
  userId: string;
  role: Role;
  createdAt: string;
  name: string | null;
  email: string | null;
  initials: string | null;
  image: string | null;
  isCurrent: boolean;
};

const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  VIEWER: "Наблюдатель",
};

export function OrganizationPanel() {
  const router = useRouter();
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Rename state
  const [nameDraft, setNameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);

  // Invite state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("VIEWER");
  const [inviting, setInviting] = useState(false);
  const [inviteErr, setInviteErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const orgsRes = await fetch("/api/orgs", { cache: "no-store" });
      const orgsJson = (await orgsRes.json()) as { orgs?: OrgInfo[] };
      const current = orgsJson.orgs?.find((o) => o.isCurrent) ?? null;
      if (!current) {
        setOrg(null);
        setMembers([]);
        setMyRole(null);
        return;
      }
      setOrg(current);
      setNameDraft(current.name);

      const mRes = await fetch(`/api/orgs/${current.id}/members`, {
        cache: "no-store",
      });
      const mJson = (await mRes.json()) as {
        ok?: boolean;
        members?: Member[];
        currentUserRole?: Role;
        error?: string;
      };
      if (!mRes.ok || !mJson.ok) {
        setErr(mJson.error ?? "Не удалось загрузить участников");
        return;
      }
      setMembers(mJson.members ?? []);
      setMyRole(mJson.currentUserRole ?? current.role);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function renameOrg() {
    if (!org || renaming) return;
    const name = nameDraft.trim();
    if (!name || name === org.name) return;
    setRenaming(true);
    setErr(null);
    try {
      const r = await fetch(`/api/orgs/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) {
        setErr(d.error ?? "Не удалось переименовать");
        return;
      }
      setOrg({ ...org, name });
      router.refresh();
    } finally {
      setRenaming(false);
    }
  }

  async function inviteMember() {
    if (!org || inviting) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setInviting(true);
    setInviteErr(null);
    try {
      const r = await fetch(`/api/orgs/${org.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      const d = (await r.json()) as { ok?: boolean; member?: Member; error?: string };
      if (!r.ok || !d.ok || !d.member) {
        setInviteErr(d.error ?? "Не удалось добавить");
        return;
      }
      setMembers((prev) => [...prev, d.member!]);
      setInviteEmail("");
      setInviteRole("VIEWER");
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(userId: string, role: Role) {
    if (!org) return;
    const r = await fetch(`/api/orgs/${org.id}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const d = (await r.json()) as { ok?: boolean; error?: string };
    if (!r.ok || !d.ok) {
      setErr(d.error ?? "Не удалось обновить роль");
      return;
    }
    setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, role } : m)));
  }

  async function removeMember(userId: string, isSelf: boolean) {
    if (!org) return;
    const confirmText = isSelf
      ? "Выйти из организации?"
      : "Удалить участника из организации?";
    if (!window.confirm(confirmText)) return;
    const r = await fetch(`/api/orgs/${org.id}/members/${userId}`, {
      method: "DELETE",
    });
    const d = (await r.json()) as { ok?: boolean; error?: string };
    if (!r.ok || !d.ok) {
      setErr(d.error ?? "Не удалось удалить");
      return;
    }
    if (isSelf) {
      router.refresh();
      return;
    }
    setMembers((prev) => prev.filter((m) => m.userId !== userId));
  }

  if (loading) {
    return (
      <div
        className="glass max-w-2xl rounded-[18px] border p-5"
        style={{ borderColor: "var(--border)" }}
      >
        <p className="text-[13px]" style={{ color: "var(--muted)" }}>
          Загрузка…
        </p>
      </div>
    );
  }

  if (!org) {
    return (
      <div
        className="glass max-w-2xl rounded-[18px] border p-5"
        style={{ borderColor: "var(--border)" }}
      >
        <p className="text-[13px]" style={{ color: "var(--muted)" }}>
          Нет активной организации. Создайте её через переключатель в сайдбаре.
        </p>
      </div>
    );
  }

  const canManage = myRole === "OWNER" || myRole === "ADMIN";
  const isOwner = myRole === "OWNER";

  return (
    <div className="space-y-4">
      {/* Общие */}
      <section
        className="glass max-w-2xl rounded-[18px] border p-5"
        style={{ borderColor: "var(--border)" }}
      >
        <h2
          className="text-[15px] font-semibold"
          style={{ color: "var(--text)" }}
        >
          Организация
        </h2>
        <p className="mt-0.5 text-[12px]" style={{ color: "var(--muted)" }}>
          Имя, тариф, участники
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label
              className="mb-1 block text-[11px] font-medium uppercase tracking-wide"
              style={{ color: "var(--hint)" }}
            >
              Название
            </label>
            <div className="flex gap-2">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                disabled={!canManage}
                className="flex-1 rounded-[10px] border px-3 py-2 text-[13px] outline-none disabled:opacity-60"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface)",
                  color: "var(--text)",
                }}
              />
              <button
                type="button"
                onClick={renameOrg}
                disabled={!canManage || renaming || !nameDraft.trim() || nameDraft.trim() === org.name}
                className="rounded-[10px] px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #7B5CF5, #E040FB)",
                  color: "#fff",
                }}
              >
                {renaming ? "…" : "Сохранить"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <InfoBlock label="Slug" value={org.slug} />
            <InfoBlock label="Тариф" value={org.plan} />
            <InfoBlock label="Ваша роль" value={ROLE_LABEL[myRole ?? org.role]} />
          </div>
        </div>
      </section>

      {/* Участники */}
      <section
        className="glass max-w-2xl rounded-[18px] border p-5"
        style={{ borderColor: "var(--border)" }}
      >
        <h2 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
          Участники ({members.length})
        </h2>
        <p className="mt-0.5 text-[12px]" style={{ color: "var(--muted)" }}>
          Роли: OWNER — полный доступ, ADMIN — управление без смены владельцев,
          VIEWER — только просмотр
        </p>

        {err ? (
          <p
            className="mt-3 rounded-[10px] border px-3 py-2 text-[12px]"
            style={{ borderColor: "var(--red)", color: "var(--red)" }}
          >
            {err}
          </p>
        ) : null}

        {/* Invite */}
        {canManage ? (
          <div
            className="mt-4 rounded-[12px] border p-3"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <p
              className="mb-2 text-[11px] font-medium uppercase tracking-wide"
              style={{ color: "var(--hint)" }}
            >
              Добавить участника
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email@company.com"
                className="flex-1 rounded-[10px] border px-3 py-2 text-[13px] outline-none"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                }}
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Role)}
                className="rounded-[10px] border px-3 py-2 text-[13px] outline-none"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                }}
              >
                <option value="VIEWER">Наблюдатель</option>
                <option value="ADMIN">Администратор</option>
                {isOwner ? <option value="OWNER">Владелец</option> : null}
              </select>
              <button
                type="button"
                onClick={inviteMember}
                disabled={inviting || !inviteEmail.trim()}
                className="rounded-[10px] px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #7B5CF5, #E040FB)",
                  color: "#fff",
                }}
              >
                {inviting ? "…" : "Добавить"}
              </button>
            </div>
            {inviteErr ? (
              <p
                className="mt-2 text-[12px]"
                style={{ color: "var(--red)" }}
              >
                {inviteErr}
              </p>
            ) : null}
            <p className="mt-2 text-[11px]" style={{ color: "var(--hint)" }}>
              Пользователь должен быть уже зарегистрирован в системе.
            </p>
          </div>
        ) : null}

        {/* Members list */}
        <div className="mt-4 space-y-2">
          {members.map((m) => (
            <MemberRow
              key={m.userId}
              member={m}
              myRole={myRole}
              onChangeRole={changeRole}
              onRemove={removeMember}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-[10px] border px-3 py-2"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface)",
      }}
    >
      <p
        className="text-[10px] font-medium uppercase tracking-wide"
        style={{ color: "var(--hint)" }}
      >
        {label}
      </p>
      <p
        className="mt-0.5 truncate text-[13px]"
        style={{ color: "var(--text)" }}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function MemberRow({
  member,
  myRole,
  onChangeRole,
  onRemove,
}: {
  member: Member;
  myRole: Role | null;
  onChangeRole: (userId: string, role: Role) => void;
  onRemove: (userId: string, isSelf: boolean) => void;
}) {
  const isOwner = myRole === "OWNER";
  const isAdmin = myRole === "ADMIN";
  const canManage = isOwner || (isAdmin && member.role !== "OWNER" && !member.isCurrent);
  const canChangeOwnerRole = isOwner; // Только владелец может понижать владельцев
  const canChangeRole =
    canManage &&
    (member.role !== "OWNER" || canChangeOwnerRole) &&
    !member.isCurrent; // Сам себе роль не меняешь

  const canRemove = member.isCurrent || canManage;

  return (
    <div
      className="flex items-center gap-3 rounded-[12px] border px-3 py-2"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
        style={{
          background: "linear-gradient(135deg, #7B5CF5, #E040FB)",
          color: "#fff",
        }}
      >
        {(member.initials || member.name || member.email || "?").slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-[13px] font-medium"
          style={{ color: "var(--text)" }}
        >
          {member.name || member.email || member.userId}
          {member.isCurrent ? (
            <span
              className="ml-2 text-[10px]"
              style={{ color: "var(--blue)" }}
            >
              (вы)
            </span>
          ) : null}
        </p>
        <p
          className="truncate text-[11px]"
          style={{ color: "var(--muted)" }}
        >
          {member.email ?? ""}
        </p>
      </div>

      {canChangeRole ? (
        <select
          value={member.role}
          onChange={(e) => onChangeRole(member.userId, e.target.value as Role)}
          className="rounded-[8px] border px-2 py-1 text-[12px] outline-none"
          style={{
            borderColor: "var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
          }}
        >
          <option value="VIEWER">Наблюдатель</option>
          <option value="ADMIN">Администратор</option>
          {canChangeOwnerRole ? <option value="OWNER">Владелец</option> : null}
        </select>
      ) : (
        <span
          className="rounded-[8px] px-2 py-1 text-[11px]"
          style={{
            background: "rgba(255,255,255,0.04)",
            color: "var(--muted)",
          }}
        >
          {ROLE_LABEL[member.role]}
        </span>
      )}

      {canRemove ? (
        <button
          type="button"
          onClick={() => onRemove(member.userId, member.isCurrent)}
          className="rounded-[8px] px-2 py-1 text-[11px] transition-colors hover:bg-[rgba(255,255,255,0.06)]"
          style={{ color: "var(--red)" }}
          title={member.isCurrent ? "Выйти" : "Удалить"}
        >
          {member.isCurrent ? "Выйти" : "×"}
        </button>
      ) : null}
    </div>
  );
}
