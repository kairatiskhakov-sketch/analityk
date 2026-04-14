"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type Tab = "signin" | "signup";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (res?.error) {
        setError("Неверный email или пароль");
        setLoading(false);
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Ошибка входа");
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== password2) {
      setError("Пароли не совпадают");
      return;
    }
    if (password.length < 8) {
      setError("Пароль не короче 8 символов");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
        }),
      });
      const data = (await r.json()) as { error?: string };
      if (!r.ok) {
        setError(data.error ?? "Ошибка регистрации");
        setLoading(false);
        return;
      }
      const sign = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (sign?.error) {
        setError("Аккаунт создан, но вход не удался — войди вручную");
        setTab("signin");
        setLoading(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Сеть недоступна");
      setLoading(false);
    }
  }

  const tabBtn = (id: Tab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => {
        setTab(id);
        setError(null);
      }}
      className="flex-1 border-b-2 py-2.5 text-[13px] transition-colors"
      style={{
        color: tab === id ? "var(--text)" : "var(--muted)",
        fontWeight: tab === id ? 600 : 400,
        borderBottomColor: tab === id ? "var(--accent)" : "transparent",
        background: "transparent",
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: "#0a0a0a" }}
    >
      <div
        className="w-full max-w-[400px] rounded-[12px] border p-6 shadow-xl"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="mb-6 flex flex-col items-center gap-2">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-lg font-bold"
            style={{ background: "var(--accent)", color: "#000000" }}
          >
            S
          </div>
          <h1 className="text-base font-semibold" style={{ color: "var(--text)" }}>
            Saldo CRM
          </h1>
        </div>

        <div className="mb-5 flex border-b" style={{ borderColor: "var(--border)" }}>
          {tabBtn("signin", "Войти")}
          {tabBtn("signup", "Регистрация")}
        </div>

        {error ? (
          <p
            className="mb-3 rounded-[8px] px-2.5 py-2 text-[12px]"
            style={{ background: "var(--red-bg)", color: "var(--red)" }}
          >
            {error}
          </p>
        ) : null}

        {tab === "signin" ? (
          <form onSubmit={handleSignIn} className="space-y-3">
            <div>
              <label
                className="mb-1 block text-[11px] font-medium uppercase tracking-[0.1em]"
                style={{ color: "var(--muted)" }}
              >
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none ring-0 focus:border-[var(--border2)]"
                style={{
                  borderColor: "var(--border2)",
                  background: "var(--surface2)",
                  color: "var(--text)",
                }}
              />
            </div>
            <div>
              <label
                className="mb-1 block text-[11px] font-medium uppercase tracking-[0.1em]"
                style={{ color: "var(--muted)" }}
              >
                Пароль
              </label>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none"
                style={{
                  borderColor: "var(--border2)",
                  background: "var(--surface2)",
                  color: "var(--text)",
                }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-[10px] py-2.5 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: "var(--accent)", color: "#000000" }}
            >
              {loading ? "…" : "Войти"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3">
            <div>
              <label
                className="mb-1 block text-[11px] font-medium uppercase tracking-[0.1em]"
                style={{ color: "var(--muted)" }}
              >
                Имя
              </label>
              <input
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none"
                style={{
                  borderColor: "var(--border2)",
                  background: "var(--surface2)",
                  color: "var(--text)",
                }}
              />
            </div>
            <div>
              <label
                className="mb-1 block text-[11px] font-medium uppercase tracking-[0.1em]"
                style={{ color: "var(--muted)" }}
              >
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none"
                style={{
                  borderColor: "var(--border2)",
                  background: "var(--surface2)",
                  color: "var(--text)",
                }}
              />
            </div>
            <div>
              <label
                className="mb-1 block text-[11px] font-medium uppercase tracking-[0.1em]"
                style={{ color: "var(--muted)" }}
              >
                Пароль
              </label>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none"
                style={{
                  borderColor: "var(--border2)",
                  background: "var(--surface2)",
                  color: "var(--text)",
                }}
              />
            </div>
            <div>
              <label
                className="mb-1 block text-[11px] font-medium uppercase tracking-[0.1em]"
                style={{ color: "var(--muted)" }}
              >
                Повтор пароля
              </label>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                className="w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none"
                style={{
                  borderColor: "var(--border2)",
                  background: "var(--surface2)",
                  color: "var(--text)",
                }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-[10px] py-2.5 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: "var(--accent)", color: "#000000" }}
            >
              {loading ? "…" : "Создать аккаунт"}
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-[11px]" style={{ color: "var(--hint)" }}>
          <Link href="/" style={{ color: "var(--blue)" }}>
            На главную
          </Link>
        </p>
      </div>
    </div>
  );
}
