"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CrmStatusResponse } from "@/lib/crm/status";
import { OrgSwitcher } from "@/components/layout/OrgSwitcher";

type NavItem = { href: string; label: string; icon: string };
type NavGroup = { label: string; items: NavItem[] };

const BASE_NAV_GROUPS: NavGroup[] = [
  {
    label: "Аналитика",
    items: [
      { href: "/dashboard", label: "Дашборд", icon: "chart" },
      { href: "/dashboard/marketing", label: "Маркетинг", icon: "megaphone" },
      { href: "/dashboard/managers", label: "Менеджеры", icon: "users" },
      { href: "/dashboard/plan", label: "План / Факт", icon: "target" },
      { href: "/dashboard/leads", label: "Лиды", icon: "clock" },
    ],
  },
  {
    label: "Система",
    items: [
      { href: "/dashboard/settings", label: "Настройки", icon: "settings" },
      { href: "/dashboard/profile", label: "Профиль", icon: "user" },
    ],
  },
];

const ADMIN_NAV_GROUP: NavGroup = {
  label: "Админка",
  items: [
    { href: "/admin/users", label: "Пользователи", icon: "shield" },
  ],
};

const ICONS: Record<string, React.ReactNode> = {
  chart: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
      <rect x="1" y="8" width="3" height="7" rx="1" />
      <rect x="6" y="5" width="3" height="10" rx="1" />
      <rect x="11" y="1" width="3" height="14" rx="1" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
      <circle cx="6" cy="5" r="2.5" />
      <circle cx="11" cy="5" r="2" />
      <path d="M1 14c0-2.8 2.2-5 5-5h1c2.8 0 5 2.2 5 5" />
    </svg>
  ),
  target: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
      <circle cx="8" cy="8" r="6.5" />
      <circle cx="8" cy="8" r="3.5" />
      <circle cx="8" cy="8" r="1" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 4.5v4l2.5 1.5" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
      <circle cx="8" cy="5" r="3" />
      <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    </svg>
  ),
  megaphone: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
      <path d="M2 6.5v3l8 3.5V3L2 6.5z" />
      <path d="M10 6.5h2.5a1.5 1.5 0 0 1 0 3H10" />
      <path d="M4 9.5L4.5 14h2L6 10" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
      <path d="M8 1.5l5.5 2v4.5c0 3.3-2.4 6.2-5.5 7-3.1-0.8-5.5-3.7-5.5-7V3.5L8 1.5z" />
      <path d="M5.5 8L7 9.5l3.5-3.5" />
    </svg>
  ),
};

interface SidebarProps {
  user?: { name: string; initials: string; role: string };
  initialStatus?: CrmStatusResponse;
  isPlatformAdmin?: boolean;
}

export function Sidebar({
  user = { name: "Пользователь", initials: "П", role: "Аналитика" },
  initialStatus,
  isPlatformAdmin = false,
}: SidebarProps) {
  const pathname = usePathname();
  const isBitrixConnected = Boolean(initialStatus?.bitrix?.connected ?? true);
  const navGroups: NavGroup[] = isPlatformAdmin
    ? [...BASE_NAV_GROUPS, ADMIN_NAV_GROUP]
    : BASE_NAV_GROUPS;

  return (
    <aside
      className="flex w-[240px] flex-shrink-0 flex-col border-r px-3 py-4"
      style={{ background: "rgba(13,11,30,0.95)", borderColor: "rgba(255,255,255,0.06)" }}
    >
      <Link href="/dashboard" className="mb-4 flex items-center gap-2 px-2">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-[12px] text-[18px] font-bold"
          style={{ background: "linear-gradient(135deg, #7B5CF5, #E040FB)", color: "#ffffff" }}
        >
          S
        </div>
        <div>
          <p className="text-[30px] font-semibold leading-none" style={{ color: "var(--text)" }}>
            Saldo CRM
          </p>
          <p className="text-[11px]" style={{ color: "var(--hint)" }}>
            Dark analytics mode
          </p>
        </div>
      </Link>

      <div className="mb-3">
        <OrgSwitcher />
      </div>

      <nav className="flex-1 space-y-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p
              className="mb-1 px-3 text-[10px] font-medium uppercase tracking-[0.12em]"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-[10px] rounded-[10px] px-3 py-2 text-[13px] no-underline transition-all hover:bg-[rgba(255,255,255,0.06)] hover:text-[rgba(255,255,255,0.8)]"
                    style={{
                      background: active ? "rgba(123,92,245,0.2)" : "transparent",
                      color: active ? "#9B7FF8" : "rgba(255,255,255,0.5)",
                      fontWeight: active ? 500 : 400,
                    }}
                  >
                    <span className="h-4 w-4">{ICONS[item.icon]}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-3 space-y-2">
        <div
          className="rounded-[12px] border px-3 py-2.5"
          style={{
            background: "rgba(255,255,255,0.04)",
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <div className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 rounded-full"
              style={{ background: isBitrixConnected ? "#00E676" : "rgba(255,255,255,0.35)" }}
            />
            <span className="text-[13px]" style={{ color: "var(--text)" }}>
              Bitrix24
            </span>
          </div>
          <p className="mt-1 text-[11px]" style={{ color: "var(--hint)" }}>
            ● live
          </p>
        </div>

        <Link
          href="/dashboard/profile"
          className="flex cursor-pointer items-center gap-[10px] rounded-[12px] border px-3 py-2.5"
          style={{
            background: "rgba(255,255,255,0.04)",
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold"
            style={{ background: "linear-gradient(135deg, #7B5CF5, #E040FB)", color: "#fff" }}
          >
            {user.initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium" style={{ color: "var(--text)" }}>
              {user.name}
            </p>
            <p className="text-[11px]" style={{ color: "var(--hint)" }}>
              {user.role}
            </p>
          </div>
          <span style={{ color: "var(--hint)" }}>→</span>
        </Link>
      </div>
    </aside>
  );
}
