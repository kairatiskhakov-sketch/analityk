import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { LogoutButton } from "../logout-button";

export const dynamic = "force-dynamic";

export default async function AccountBlockedPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.status === "ACTIVE") redirect("/dashboard");
  if (user.status === "PENDING") redirect("/account/pending");

  // Подтянем причину из БД (свежая)
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { blockReason: true, blockedAt: true },
  });

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
              background: "linear-gradient(135deg, #EF4444, #B91C1C)",
              color: "#ffffff",
            }}
          >
            ⛔
          </div>
          <h1
            className="text-base font-semibold"
            style={{ color: "var(--text)" }}
          >
            Доступ заблокирован
          </h1>
        </div>

        <p
          className="mb-3 text-[13px] leading-relaxed"
          style={{ color: "var(--text)" }}
        >
          Ваш аккаунт <strong>{user.email}</strong> заблокирован администратором
          платформы.
        </p>

        {dbUser?.blockReason ? (
          <div
            className="mb-4 rounded-[10px] border p-3 text-[12px] leading-relaxed"
            style={{
              borderColor: "var(--red-bg)",
              background: "var(--red-bg)",
              color: "var(--red)",
            }}
          >
            <div
              className="mb-1 text-[11px] uppercase tracking-[0.1em]"
              style={{ color: "var(--muted)" }}
            >
              Причина
            </div>
            {dbUser.blockReason}
          </div>
        ) : null}

        <p
          className="mb-5 text-[12px] leading-relaxed"
          style={{ color: "var(--hint)" }}
        >
          Если считаете, что это ошибка — свяжитесь с администратором.
        </p>

        <LogoutButton />
      </div>
    </div>
  );
}
