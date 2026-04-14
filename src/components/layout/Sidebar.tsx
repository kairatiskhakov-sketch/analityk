"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { cn } from "@/lib/utils";
import type { CrmStatusResponse } from "@/lib/crm/status";
import { formatRelativeRu } from "@/lib/time/relative";
import { fetcher } from "@/lib/swr/fetcher";

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
      { href: "/dashboard/managers", icon: "users", label: "Менеджеры" },
      { href: "/dashboard/plan", icon: "target", label: "План / Факт" },
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
  target: (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <circle cx="7" cy="7" r="5.5" />
      <circle cx="7" cy="7" r="2.5" />
      <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13" strokeLinecap="round" />
    </svg>
  ),
  users: (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <circle cx="5" cy="4.5" r="2" />
      <circle cx="9.5" cy="4.5" r="2" />
      <path d="M2 12c.5-2 2.5-3.5 5-3.5s4.5 1.5 5 3.5" />
      <path d="M8 12c.8-1.2 2-2 3.5-2 1 0 2 .3 2.5 1" />
    </svg>
  ),
};

type ConnectedRow = { name: string; syncLabel: string };

function buildConnectedRows(data: CrmStatusResponse | undefined): ConnectedRow[] {
  if (!data) return [];
  const rows: ConnectedRow[] = [];
  if (data.bitrix.connected) {
    rows.push({
      name: "Bitrix24",
      syncLabel: "● live",
    });
  }
  if (data.amo.connected) {
    rows.push({
      name: "AmoCRM",
      syncLabel: data.amo.lastSync
        ? `синхр. ${formatRelativeRu(data.amo.lastSync)}`
        : "синхр. нет данных",
    });
  }
  return rows;
}

interface SidebarProps {
  user?: { name: string; initials: string; role: string };
  initialStatus?: CrmStatusResponse;
}

export function Sidebar({
  user = { name: "Пользователь", initials: "П", role: "Аналитика" },
  initialStatus,
}: SidebarProps) {
  const pathname = usePathname();

  const { data } = useSWR<CrmStatusResponse>("/api/crm/status", fetcher, {
    refreshInterval: 60_000,
    fallbackData: initialStatus,
  });

  const leadsCount = data?.leadsTotal ?? initialStatus?.leadsTotal ?? 0;
  const connectedRows = buildConnectedRows(data ?? initialStatus);

  return (
    <aside
      className="flex w-[196px] flex-shrink-0 flex-col border-r"
      style={{ background: "#0d0d0d", borderColor: "var(--border)" }}
    >
      <Link
        href="/dashboard"
        className="mx-3.5 mb-7 mt-5 flex cursor-pointer items-center gap-2.5 px-3 pt-1 transition-opacity hover:opacity-90"
      >
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] text-[15px] font-bold"
          style={{ background: "var(--accent)", color: "#000000" }}
        >
          S
        </div>
        <span
          className="text-sm font-semibold tracking-tight"
          style={{ color: "var(--text)" }}
        >
          Saldo CRM
        </span>
      </Link>

      <nav className="flex-1 space-y-4 px-3.5">
        {NAV.map((group) => (
          <div key={group.label}>
            <span
              className="mb-1.5 block px-2 text-[9.5px] font-medium uppercase tracking-[0.1em]"
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
                    "mb-0.5 flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[13px] transition-all",
                    active ? "font-semibold" : "hover:opacity-90",
                  )}
                  style={{
                    color: active ? "#000000" : "var(--muted)",
                    background: active ? "var(--accent)" : "transparent",
                  }}
                >
                  {ICONS[item.icon]}
                  <span className="flex-1">{item.label}</span>
                  {item.badge && leadsCount > 0 ? (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{
                        background: active ? "rgba(0,0,0,0.15)" : "var(--surface2)",
                        color: active ? "#000" : "var(--accent)",
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
        {connectedRows.length === 0 ? (
          <div
            className="rounded-[12px] border p-2.5"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-1.5">
              <div
                className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
                style={{ background: "var(--hint)" }}
              />
              <span
                className="text-[12px] font-medium"
                style={{ color: "var(--muted)" }}
              >
                CRM не подключена
              </span>
            </div>
            <Link
              href="/dashboard/settings"
              className="mt-1.5 inline-block text-[10.5px] font-semibold"
              style={{ color: "var(--blue)" }}
            >
              Настроить →
            </Link>
          </div>
        ) : (
          connectedRows.map((c) => (
            <div
              key={c.name}
              className="rounded-[12px] border p-2.5"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-1.5">
                <div
                  className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
                  style={{ background: "var(--accent)" }}
                />
                <span
                  className="text-[12px] font-medium"
                  style={{ color: "var(--text)" }}
                >
                  {c.name}
                </span>
              </div>
              <p className="mt-0.5 text-[10px]" style={{ color: "var(--hint)" }}>
                {c.syncLabel}
              </p>
            </div>
          ))
        )}

        <div
          className="flex items-center gap-2.5 rounded-[12px] border p-2.5"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div
            className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
            style={{ background: "var(--accent)", color: "#000000" }}
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
