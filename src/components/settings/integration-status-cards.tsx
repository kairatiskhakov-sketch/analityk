"use client";

import useSWR from "swr";
import type { CrmStatusResponse } from "@/lib/crm/status";
import { formatRelativeRu } from "@/lib/time/relative";
import { fetcher } from "@/lib/swr/fetcher";
import { cn } from "@/lib/utils";

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("inline h-4 w-4 animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

type CardProps = { statusInitial?: CrmStatusResponse };

function cardShell(
  title: string,
  children: React.ReactNode,
  headerRight: React.ReactNode,
) {
  return (
    <div
      className="rounded-[12px] border p-5"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2
          className="text-[15px] font-semibold tracking-tight"
          style={{ color: "var(--text)" }}
        >
          {title}
        </h2>
        {headerRight}
      </div>
      {children}
    </div>
  );
}

export function AmoIntegrationCard({ statusInitial }: CardProps) {
  const { data, isLoading } = useSWR<CrmStatusResponse>("/api/crm/status", fetcher, {
    refreshInterval: 60_000,
    fallbackData: statusInitial,
  });
  const amo = data?.amo;
  const connected = Boolean(amo?.connected);

  const header = isLoading && !data ? (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: "#eab308" }} />
      <span className="text-[12px] font-medium" style={{ color: "#ca8a04" }}>
        Проверяем...
      </span>
      <Spinner className="h-3.5 w-3.5 text-amber-600" />
    </div>
  ) : connected ? (
    <div className="flex items-center gap-2">
      <span
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ background: "var(--green)" }}
      />
      <span className="text-[12px] font-medium" style={{ color: "var(--green)" }}>
        Подключено
      </span>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <span
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ background: "var(--hint)" }}
      />
      <span className="text-[12px]" style={{ color: "var(--hint)" }}>
        Не подключено
      </span>
    </div>
  );

  return cardShell(
    "AmoCRM",
    connected ? (
      <div className="space-y-2 text-[13px]" style={{ color: "var(--text)" }}>
        {amo?.domain ? (
          <p>
            <span style={{ color: "var(--hint)" }}>Поддомен: </span>
            {amo.domain}
          </p>
        ) : null}
        <p>
          Последняя синхронизация:{" "}
          {amo?.lastSync ? formatRelativeRu(amo.lastSync) : "—"}
        </p>
        <p className="text-[12px]" style={{ color: "var(--hint)" }}>
          Данные лидов не кешируются в БД — запросы к AmoCRM API (в разработке для
          дашборда).
        </p>
      </div>
    ) : (
      <p className="text-[12px] leading-relaxed" style={{ color: "var(--muted)" }}>
        Подключение настраивается через API. После активации записи в БД здесь
        отобразятся статусы и счётчики.
      </p>
    ),
    header,
  );
}

export function TelegramIntegrationCard({ statusInitial }: CardProps) {
  const { data, isLoading } = useSWR<CrmStatusResponse>("/api/crm/status", fetcher, {
    refreshInterval: 60_000,
    fallbackData: statusInitial,
  });
  const tg = data?.telegram;
  const connected = Boolean(tg?.connected);

  const header = isLoading && !data ? (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: "#eab308" }} />
      <span className="text-[12px] font-medium" style={{ color: "#ca8a04" }}>
        Проверяем...
      </span>
      <Spinner className="h-3.5 w-3.5 text-amber-600" />
    </div>
  ) : connected ? (
    <div className="flex items-center gap-2">
      <span
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ background: "var(--green)" }}
      />
      <span className="text-[12px] font-medium" style={{ color: "var(--green)" }}>
        Подключено
      </span>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <span
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ background: "var(--hint)" }}
      />
      <span className="text-[12px]" style={{ color: "var(--hint)" }}>
        Не подключено
      </span>
    </div>
  );

  return cardShell(
    "Telegram",
    connected ? (
      <p className="text-[13px]" style={{ color: "var(--text)" }}>
        Бот активен, уведомления можно настроить в API.
      </p>
    ) : (
      <p className="text-[12px] leading-relaxed" style={{ color: "var(--muted)" }}>
        Подключение через{" "}
        <code className="text-[11px]" style={{ color: "var(--blue)" }}>
          /api/integrations/telegram/connect
        </code>
        .
      </p>
    ),
    header,
  );
}

export function GoogleIntegrationCard({ statusInitial }: CardProps) {
  const { data, isLoading } = useSWR<CrmStatusResponse>("/api/crm/status", fetcher, {
    refreshInterval: 60_000,
    fallbackData: statusInitial,
  });
  const g = data?.google;
  const connected = Boolean(g?.connected);

  const header = isLoading && !data ? (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: "#eab308" }} />
      <span className="text-[12px] font-medium" style={{ color: "#ca8a04" }}>
        Проверяем...
      </span>
      <Spinner className="h-3.5 w-3.5 text-amber-600" />
    </div>
  ) : connected ? (
    <div className="flex items-center gap-2">
      <span
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ background: "var(--green)" }}
      />
      <span className="text-[12px] font-medium" style={{ color: "var(--green)" }}>
        Подключено
      </span>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <span
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ background: "var(--hint)" }}
      />
      <span className="text-[12px]" style={{ color: "var(--hint)" }}>
        Не подключено
      </span>
    </div>
  );

  return cardShell(
    "Google",
    connected ? (
      <p className="text-[13px]" style={{ color: "var(--text)" }}>
        Аккаунт: {g?.email ?? "—"}
      </p>
    ) : (
      <p className="text-[12px] leading-relaxed" style={{ color: "var(--muted)" }}>
        Регистрация через{" "}
        <code className="text-[11px]" style={{ color: "var(--blue)" }}>
          /api/integrations/google/register
        </code>
        .
      </p>
    ),
    header,
  );
}
