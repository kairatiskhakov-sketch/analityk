import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { LogoutButton } from "../account/logout-button";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.isPlatformAdmin || user.status !== "ACTIVE") {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header
        className="sticky top-0 z-10 border-b backdrop-blur"
        style={{
          borderColor: "var(--border)",
          background: "rgba(13,11,30,0.7)",
        }}
      >
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/users"
              className="flex items-center gap-2 text-[14px] font-semibold"
              style={{ color: "var(--text)" }}
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-[8px] text-xs font-bold"
                style={{
                  background: "linear-gradient(135deg, #7B5CF5, #E040FB)",
                  color: "#ffffff",
                }}
              >
                S
              </span>
              Saldo · admin
            </Link>
            <nav className="flex items-center gap-1">
              <Link
                href="/admin/users"
                className="rounded-[8px] px-3 py-1.5 text-[12px]"
                style={{ color: "var(--muted)" }}
              >
                Пользователи
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-[12px]"
              style={{ color: "var(--muted)" }}
            >
              ← В дашборд
            </Link>
            <span
              className="text-[12px]"
              style={{ color: "var(--text)" }}
              title={user.email ?? ""}
            >
              {user.name ?? user.email}
            </span>
            <div className="w-[88px]">
              <LogoutButton />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 py-6">{children}</main>
    </div>
  );
}
