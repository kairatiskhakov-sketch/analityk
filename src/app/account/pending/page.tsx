import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { LogoutButton } from "../logout-button";

export const dynamic = "force-dynamic";

export default async function AccountPendingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.status === "ACTIVE") redirect("/dashboard");
  if (user.status === "BLOCKED") redirect("/account/blocked");

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: "transparent" }}
    >
      <div
        className="glass w-full max-w-[460px] rounded-[18px] border p-6 shadow-xl"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="mb-5 flex flex-col items-center gap-2">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-lg font-bold"
            style={{
              background: "linear-gradient(135deg, #FBBF24, #F59E0B)",
              color: "#1a1500",
            }}
          >
            ⏳
          </div>
          <h1
            className="text-base font-semibold"
            style={{ color: "var(--text)" }}
          >
            Аккаунт на рассмотрении
          </h1>
        </div>

        <p
          className="mb-3 text-[13px] leading-relaxed"
          style={{ color: "var(--text)" }}
        >
          Привет, <strong>{user.name ?? user.email}</strong>!
        </p>
        <p
          className="mb-3 text-[13px] leading-relaxed"
          style={{ color: "var(--muted)" }}
        >
          Регистрация принята. Ваш аккаунт находится на проверке у администратора
          платформы. Как только его одобрят — вы получите письмо на{" "}
          <span style={{ color: "var(--text)" }}>{user.email}</span> и сможете
          войти в систему.
        </p>
        <p
          className="mb-5 text-[12px] leading-relaxed"
          style={{ color: "var(--hint)" }}
        >
          Это занимает обычно несколько часов в рабочее время. Если вопрос
          срочный — свяжитесь с администратором напрямую.
        </p>

        <LogoutButton />
      </div>
    </div>
  );
}
