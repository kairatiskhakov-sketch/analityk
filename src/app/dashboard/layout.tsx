import { auth } from "@/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { getCrmStatusSnapshot } from "@/lib/crm/status";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, crmStatus] = await Promise.all([auth(), getCrmStatusSnapshot()]);
  const user = session?.user
    ? {
        name: session.user.name || "Пользователь",
        initials: session.user.initials || "П",
        role: session.user.role === "ADMIN" ? "Администратор" : "Менеджер",
      }
    : undefined;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      <Sidebar user={user} initialStatus={crmStatus} />
      <main
        className="flex min-w-0 flex-1 flex-col overflow-hidden"
        style={{ background: "linear-gradient(180deg, rgba(18,15,45,0.35) 0%, rgba(13,11,30,0) 100%)" }}
      >
        {children}
      </main>
    </div>
  );
}
