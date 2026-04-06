"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { CrmSidebarStatus } from "@/lib/dashboard/sidebar-data";

const NAV: {
  label: string;
  items: {
    href: string;
    icon: string;
    label: string;
    badge?: boolean;
  }[];
}[] = [
  {
    label: "Аналитика",
    items: [
      { href: "/dashboard", icon: "chart", label: "Дашборд" },
      { href: "/dashboard/leads", icon: "clock", label: "Лиды", badge: true },
    ],
  },
  {
    label: "Система",
    items: [
      { href: "/dashboard/settings", icon: "settings", label: "Настройки" },
    ],
  },
];

const ICONS: Record<string, React.ReactNode> = {
  chart: (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-3.5 w-3.5"
    >
      <rect x="1" y="7" width="3" height="6" rx="1" />
      <rect x="5.5" y="4" width="3" height="9" rx="1" />
      <rect x="10" y="1" width="3" height="12" rx="1" />
    </svg>
  ),
  clock: (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-3.5 w-3.5"
    >
      <circle cx="7" cy="7" r="5.5" />
      <path d="M7 4v3l2 1.5" />
    </svg>
  ),
  settings: (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-3.5 w-3.5"
    >
      <circle cx="7" cy="7" r="2" />
      <path d="M7 1v2M7 11v2M1 7h2M11 7h2" />
    </svg>
  ),
};

interface SidebarProps {
  leadsCount?: number;
  crmConnections?: CrmSidebarStatus[];
  user?: { name: string; initials: string; role: string };
}

export function Sidebar({
  leadsCount = 0,
  crmConnections = [],
  user = { name: "Пользователь", initials: "П", role: "Аналитика" },
}: SidebarProps) {
  const pathname = usePathname();

  const crm =
    crmConnections.length > 0
      ? crmConnections
      : [
          { name: "Bitrix24", lastSync: "—", connected: false },
          { name: "AmoCRM", lastSync: "—", connected: false },
        ];

  return (
    <aside
      className="flex w-[196px] flex-shrink-0 flex-col border-r"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="mx-3.5 mb-7 mt-5 flex items-center gap-2.5 px-3 pt-1">
        <div
          className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[7px]"
          style={{ background: "var(--text)" }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="5.5" height="5.5" rx="1.5" fill="white" opacity="0.9" />
            <rect x="7.5" y="1" width="5.5" height="5.5" rx="1.5" fill="white" opacity="0.5" />
            <rect x="1" y="7.5" width="5.5" height="5.5" rx="1.5" fill="white" opacity="0.5" />
            <rect x="7.5" y="7.5" width="5.5" height="5.5" rx="1.5" fill="white" opacity="0.7" />
          </svg>
        </div>
        <span
          className="text-sm font-medium tracking-tight"
          style={{ color: "var(--text)" }}
        >
          Saldo CRM
        </span>
      </div>

      <nav className="flex-1 space-y-4 px-3.5">
        {NAV.map((group) => (
          <div key={group.label}>
            <span
              className="mb-1.5 block px-2 text-[9.5px] font-medium uppercase tracking-[0.09em]"
              style={{ color: "var(--hint)" }}
            >
              {group.label}
            </span>
            {group.items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "mb-0.5 flex items-center gap-2.5 rounded-[7px] px-2.5 py-1.5 text-[13px] transition-all",
                    active ? "font-medium shadow-sm" : "hover:opacity-80",
                  )}
                  style={{
                    color: active ? "var(--text)" : "var(--muted)",
                    background: active ? "var(--bg)" : "transparent",
                    boxShadow: active ? "0 1px 4px rgba(0,0,0,0.07)" : "none",
                  }}
                >
                  {ICONS[item.icon]}
                  <span className="flex-1">{item.label}</span>
                  {item.badge && leadsCount > 0 ? (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        background: "var(--blue-bg)",
                        color: "var(--blue)",
                      }}
                    >
                      {leadsCount > 999 ? "999+" : leadsCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-2 space-y-2 px-3.5 pb-3">
        {crm.map((c) => (
          <div
            key={c.name}
            className="rounded-[11px] border p-2.5"
            style={{ background: "var(--bg)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-1.5">
              <div
                className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
                style={{
                  background: c.connected ? "var(--green)" : "var(--hint)",
                }}
              />
              <span
                className="text-[12px] font-medium"
                style={{ color: "var(--text)" }}
              >
                {c.name}
              </span>
            </div>
            <p className="mt-0.5 text-[10px]" style={{ color: "var(--hint)" }}>
              {c.lastSync}
            </p>
          </div>
        ))}

        <div
          className="flex items-center gap-2.5 rounded-[11px] border p-2.5"
          style={{ background: "var(--bg)", borderColor: "var(--border)" }}
        >
          <div
            className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-white"
            style={{ background: "var(--text)" }}
          >
            {user.initials}
          </div>
          <div>
            <p className="text-[12px] font-medium" style={{ color: "var(--text)" }}>
              {user.name}
            </p>
            <p className="text-[10px]" style={{ color: "var(--hint)" }}>
              {user.role}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
