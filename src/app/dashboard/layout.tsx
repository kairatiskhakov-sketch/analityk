import { Sidebar } from "@/components/layout/Sidebar";
import { getSidebarData } from "@/lib/dashboard/sidebar-data";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { leadsCount, crmConnections } = await getSidebarData();

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      <Sidebar leadsCount={leadsCount} crmConnections={crmConnections} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
