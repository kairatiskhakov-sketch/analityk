"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SHARE_SECTION_LABELS,
  SHARE_TOKEN_HEADER,
  type ShareSection,
} from "@/lib/org/public-share-shared";

const SECTION_HREFS: Record<ShareSection, string> = {
  dashboard: "",
  marketing: "/marketing",
  managers: "/managers",
  plan: "/plan",
  leads: "/leads",
};

/**
 * Идемпотентно патчит window.fetch так, чтобы все same-origin /api/*
 * запросы получали заголовок x-share-token. Вызывается из render-фазы
 * родителя — гарантирует, что патч установлен ДО первого useEffect
 * дочерних компонентов (порядок effect'ов: дети раньше родителя).
 */
function ensureFetchPatched(token: string): void {
  if (typeof window === "undefined") return;
  type Patched = typeof window & { __publicShareToken?: string; __publicShareFetchPatched?: boolean };
  const w = window as Patched;
  w.__publicShareToken = token;
  if (w.__publicShareFetchPatched) return;
  w.__publicShareFetchPatched = true;
  const orig = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const isApi =
      url.startsWith("/api/") ||
      url.startsWith(`${window.location.origin}/api/`);
    if (isApi) {
      const t = w.__publicShareToken;
      const headers = new Headers(init?.headers ?? {});
      if (t && !headers.has(SHARE_TOKEN_HEADER)) {
        headers.set(SHARE_TOKEN_HEADER, t);
      }
      return orig(input, { ...init, headers });
    }
    return orig(input, init);
  }) as typeof window.fetch;
}

/**
 * Клиентский шелл для публичных страниц /p/[token]/*.
 * - Перехватывает window.fetch и для всех /api/* добавляет x-share-token header.
 * - Рисует упрощённый header с навигацией только по разрешённым секциям.
 */
export function PublicShareShell({
  token,
  orgName,
  sections,
  children,
}: {
  token: string;
  orgName: string;
  sections: ShareSection[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Патчим fetch в render-фазе (а не useEffect) — дочерние useEffect фетчатся
  // позже, fetch уже будет с заголовком.
  ensureFetchPatched(token);

  const navItems = sections.map((s) => ({
    section: s,
    href: `/p/${token}${SECTION_HREFS[s]}`,
    label: SHARE_SECTION_LABELS[s],
  }));

  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--bg)" }}>
      <header
        className="flex flex-shrink-0 items-center justify-between gap-4 border-b px-6 py-3"
        style={{
          background: "rgba(13,11,30,0.95)",
          borderColor: "rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[16px] font-bold"
            style={{
              background: "linear-gradient(135deg, #7B5CF5, #E040FB)",
              color: "#fff",
            }}
          >
            S
          </div>
          <div>
            <p
              className="text-[14px] font-semibold leading-none"
              style={{ color: "var(--text)" }}
            >
              {orgName}
            </p>
            <p
              className="mt-1 text-[10px] uppercase tracking-[0.12em]"
              style={{ color: "var(--hint)" }}
            >
              Публичный отчёт · только просмотр
            </p>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-1">
          {navItems.map((item) => {
            const active =
              item.section === "dashboard"
                ? pathname === item.href
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.section}
                href={item.href}
                className="rounded-[8px] px-3 py-1.5 text-[12px] no-underline transition-all"
                style={{
                  background: active
                    ? "rgba(123,92,245,0.2)"
                    : "transparent",
                  color: active ? "#9B7FF8" : "rgba(255,255,255,0.6)",
                  fontWeight: active ? 500 : 400,
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
