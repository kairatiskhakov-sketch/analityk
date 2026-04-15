"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";

type Props = {
  initialUser: {
    name: string;
    email: string;
    role: "ADMIN" | "MANAGER";
    initials: string;
    telegramId: string | null;
  };
};

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-11 rounded-full transition-colors"
      style={{ background: checked ? "var(--accent)" : "var(--border2)" }}
    >
      <span
        className="absolute top-0.5 h-5 w-5 rounded-full transition-all"
        style={{
          left: checked ? "calc(100% - 1.375rem)" : "2px",
          background: checked ? "#000000" : "#ffffff",
        }}
      />
    </button>
  );
}

export function ProfilePageClient({ initialUser }: Props) {
  const [name, setName] = useState(initialUser.name);
  const [telegramId, setTelegramId] = useState(initialUser.telegramId ?? "");
  const [emailNotify, setEmailNotify] = useState(true);
  const [telegramNotify, setTelegramNotify] = useState(Boolean(initialUser.telegramId));
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, telegramId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) {
        toast.error(data.error ?? "Не удалось сохранить профиль");
        return;
      }
      toast.success("Профиль обновлён");
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Заполните все поля пароля");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Подтверждение пароля не совпадает");
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) {
        toast.error(data.error ?? "Не удалось сменить пароль");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Пароль обновлён");
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b px-6 py-5" style={{ borderColor: "var(--border)" }}>
        <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
          Профиль
        </h1>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        <section className="glass max-w-3xl rounded-[18px] border p-5" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>Личные данные</h2>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full text-[28px] font-bold" style={{ background: "linear-gradient(135deg, #7B5CF5, #E040FB)", color: "#ffffff" }}>
              {initialUser.initials}
            </div>
            <div className="grid flex-1 gap-3">
              <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-[8px] border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border2)", background: "var(--surface2)", color: "var(--text)" }} placeholder="Имя" />
              <input value={initialUser.email} readOnly className="rounded-[8px] border px-3 py-2 text-[13px] opacity-80" style={{ borderColor: "var(--border2)", background: "var(--surface2)", color: "var(--muted)" }} />
              <input value={initialUser.role} readOnly className="rounded-[8px] border px-3 py-2 text-[13px] opacity-80" style={{ borderColor: "var(--border2)", background: "var(--surface2)", color: "var(--muted)" }} />
            </div>
          </div>
          <button type="button" onClick={() => void saveProfile()} disabled={savingProfile} className="btn-primary mt-4 rounded-[12px] px-4 py-2 text-[13px] font-semibold disabled:opacity-50">
            {savingProfile ? "Сохранение..." : "Сохранить изменения"}
          </button>
        </section>

        <section className="glass max-w-3xl rounded-[18px] border p-5" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>Безопасность</h2>
          <div className="mt-4 grid gap-3">
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="rounded-[8px] border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border2)", background: "var(--surface2)", color: "var(--text)" }} placeholder="Текущий пароль" />
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="rounded-[8px] border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border2)", background: "var(--surface2)", color: "var(--text)" }} placeholder="Новый пароль" />
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="rounded-[8px] border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border2)", background: "var(--surface2)", color: "var(--text)" }} placeholder="Подтверждение пароля" />
          </div>
          <button type="button" onClick={() => void changePassword()} disabled={savingPassword} className="btn-primary mt-4 rounded-[12px] px-4 py-2 text-[13px] font-semibold disabled:opacity-50">
            {savingPassword ? "Смена..." : "Изменить пароль"}
          </button>
        </section>

        <section className="glass max-w-3xl rounded-[18px] border p-5" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>Уведомления</h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px]" style={{ color: "var(--text)" }}>Email уведомления</span>
              <Toggle checked={emailNotify} onChange={setEmailNotify} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px]" style={{ color: "var(--text)" }}>Telegram уведомления</span>
              <Toggle checked={telegramNotify} onChange={setTelegramNotify} />
            </div>
            <input value={telegramId} onChange={(e) => setTelegramId(e.target.value)} className="rounded-[8px] border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border2)", background: "var(--surface2)", color: "var(--text)" }} placeholder="Telegram ID" />
          </div>
        </section>

        <section className="glass max-w-3xl rounded-[18px] border p-5" style={{ borderColor: "var(--red)" }}>
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--red)" }}>Опасная зона</h2>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="mt-4 rounded-[8px] border px-4 py-2 text-[13px] font-semibold"
            style={{ borderColor: "var(--red)", background: "var(--red-bg)", color: "var(--red)" }}
          >
            Выйти из аккаунта
          </button>
        </section>
      </div>
    </div>
  );
}
