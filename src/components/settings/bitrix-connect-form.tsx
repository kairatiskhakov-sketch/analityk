"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import type { CrmStatusResponse } from "@/lib/crm/status";
import { formatRelativeRu } from "@/lib/time/relative";
import { fetcher } from "@/lib/swr/fetcher";
import { cn } from "@/lib/utils";

type Props = {
  initial: {
    connectionId: string | null;
    domain: string | null;
    isActive: boolean;
    lastSyncAt: string | null;
    hasWebhook: boolean;
    profileUserId: string | null;
    managersCount: number;
    pipelinesCount: number;
  };
  statusInitial?: CrmStatusResponse;
};

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

export function BitrixConnectForm({ initial, statusInitial }: Props) {
  const router = useRouter();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [loading, setLoading] = useState<
    "connect" | "verify" | "sync" | "disconnect" | null
  >(null);

  const { data: status } = useSWR<CrmStatusResponse>("/api/crm/status", fetcher, {
    refreshInterval: 60_000,
    fallbackData: statusInitial,
  });

  const bitrix = status?.bitrix;
  const connected = Boolean(bitrix?.connected);
  const connectionId = bitrix?.connectionId ?? initial.connectionId ?? null;

  const checking = loading === "connect" || loading === "verify";

  const inputClass =
    "w-full rounded-[7px] border px-3 py-2 text-[13px] outline-none placeholder:text-[var(--hint)]";
  const inputStyle = {
    borderColor: "var(--border2)",
    background: "var(--surface2)",
    color: "var(--text)",
  } as const;

  async function connect() {
    const url = webhookUrl.trim();
    if (!url) {
      setConnectError("Введите URL вебхука");
      return;
    }
    setConnectError(null);
    setLoading("connect");
    try {
      const r = await fetch("/api/crm/bitrix/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: url }),
      });
      const data = (await r.json()) as {
        ok?: boolean;
        error?: string;
        domain?: string;
        userId?: string;
        connectionId?: string;
      };
      if (!r.ok || data.ok === false) {
        const err = data.error ?? "Не удалось подключиться";
        setConnectError(err);
        toast.error(err);
        return;
      }
      toast.success("Bitrix24 подключён. Загружаем справочники…");
      setWebhookUrl("");
      await mutate("/api/crm/status");
      router.refresh();
    } catch {
      setConnectError("Сеть недоступна");
      toast.error("Сеть недоступна");
    } finally {
      setLoading(null);
    }
  }

  async function verifySaved() {
    if (!connectionId) return;
    setLoading("verify");
    try {
      const r = await fetch("/api/crm/bitrix/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const data = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !data.ok) {
        toast.error(data.error ?? "Соединение недоступно");
        return;
      }
      toast.success("Соединение с Bitrix24 в порядке");
    } catch {
      toast.error("Сеть недоступна");
    } finally {
      setLoading(null);
    }
  }

  async function refreshDictionaries() {
    if (!connectionId) return;
    setLoading("sync");
    try {
      const r = await fetch("/api/crm/bitrix/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const data = (await r.json()) as {
        ok?: boolean;
        error?: string;
        result?: { pipelinesCount: number; managersCount: number };
      };
      if (!r.ok || !data.ok) {
        toast.error(data.error ?? "Не удалось обновить справочники");
        return;
      }
      const p = data.result?.pipelinesCount ?? 0;
      const m = data.result?.managersCount ?? 0;
      const s = (data.result as { loadedStages?: number } | undefined)?.loadedStages ?? 0;
      toast.success(`Обновлено: воронок ${p}, менеджеров ${m}, этапов ${s}`);
      await mutate("/api/crm/status");
      router.refresh();
    } catch {
      toast.error("Сеть недоступна");
    } finally {
      setLoading(null);
    }
  }

  async function disconnect() {
    if (!connectionId) return;
    setLoading("disconnect");
    try {
      const r = await fetch("/api/crm/bitrix/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const data = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !data.ok) {
        toast.error(data.error ?? "Не удалось отключить");
        return;
      }
      toast.message("Bitrix24 отключён");
      setConnectError(null);
      await mutate("/api/crm/status");
      router.refresh();
    } catch {
      toast.error("Сеть недоступна");
    } finally {
      setLoading(null);
    }
  }

  const lastSyncLabel = bitrix?.lastSync
    ? formatRelativeRu(bitrix.lastSync)
    : initial.lastSyncAt
      ? formatRelativeRu(initial.lastSyncAt)
      : "—";

  const domainLabel = bitrix?.domain ?? initial.domain ?? "—";
  const profileId = initial.profileUserId;
  const managersCount = initial.managersCount;
  const pipelinesCount = initial.pipelinesCount;

  return (
    <div
      className="rounded-[12px] border p-5"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2
          className="text-[15px] font-semibold tracking-tight"
          style={{ color: "var(--text)" }}
        >
          Bitrix24
        </h2>
        {checking ? (
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: "#eab308" }}
              aria-hidden
            />
            <span className="text-[12px] font-medium" style={{ color: "#ca8a04" }}>
              Проверяем соединение…
            </span>
          </div>
        ) : connected ? (
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: "var(--green)" }}
              aria-hidden
            />
            <span className="text-[12px] font-medium" style={{ color: "var(--green)" }}>
              Подключено ✓
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: "var(--hint)" }}
              aria-hidden
            />
            <span className="text-[12px]" style={{ color: "var(--hint)" }}>
              Не подключено
            </span>
          </div>
        )}
      </div>

      {!connected ? (
        <p className="mb-4 text-[12px] leading-relaxed" style={{ color: "var(--muted)" }}>
          Входящий вебхук из «Разработчикам» → «Другое». Достаточно одного поля — полного URL.
        </p>
      ) : null}

      {loading === "connect" ? (
        <div className="flex items-center gap-2 py-6" style={{ color: "var(--muted)" }}>
          <Spinner />
          <span className="text-[13px]">Проверяем соединение…</span>
        </div>
      ) : connected ? (
        <div className="space-y-3">
          <p className="text-[13px]" style={{ color: "var(--text)" }}>
            <span style={{ color: "var(--hint)" }}>Портал: </span>
            {domainLabel}
          </p>
          {profileId ? (
            <p className="text-[13px]" style={{ color: "var(--text)" }}>
              <span style={{ color: "var(--hint)" }}>Пользователь (profile): </span>
              ID {profileId}
            </p>
          ) : null}
          <p className="text-[13px]" style={{ color: "var(--text)" }}>
            <span style={{ color: "var(--hint)" }}>Менеджеров в кеше: </span>
            {managersCount}
          </p>
          <p className="text-[13px]" style={{ color: "var(--text)" }}>
            <span style={{ color: "var(--hint)" }}>Воронок в кеше: </span>
            {pipelinesCount}
          </p>
          <p className="text-[12px]" style={{ color: "var(--muted)" }}>
            Справочники: {lastSyncLabel}
          </p>
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--muted)" }}>
            Данные дашборда запрашиваются из Bitrix24 REST; ответы кешируются ~5 мин. Названия
            источников и причин отказа подставляются из кеша в БД после синхронизации.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={loading !== null}
              onClick={verifySaved}
              className="rounded-[7px] border px-3 py-2 text-[13px] font-medium transition-opacity disabled:opacity-50"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface)",
                color: "var(--text)",
              }}
            >
              {loading === "verify" ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="h-3.5 w-3.5" />
                  Проверка…
                </span>
              ) : (
                "Проверить соединение"
              )}
            </button>
            <button
              type="button"
              disabled={loading !== null}
              onClick={refreshDictionaries}
              className="rounded-[8px] px-3 py-2 text-[13px] font-semibold transition-opacity disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#000000" }}
            >
              {loading === "sync" ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="h-3.5 w-3.5 text-black" />
                  Обновление…
                </span>
              ) : (
                "Обновить справочники"
              )}
            </button>
            <button
              type="button"
              disabled={loading !== null}
              onClick={disconnect}
              className="rounded-[6px] px-2 py-1 text-[11px] font-medium transition-opacity disabled:opacity-50"
              style={{ color: "var(--red)" }}
            >
              {loading === "disconnect" ? "…" : "Отключить"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <div>
              <label
                className="mb-1 block text-[10.5px] font-medium uppercase tracking-wide"
                style={{ color: "var(--hint)" }}
              >
                URL вебхука
              </label>
              <input
                className={inputClass}
                style={{
                  ...inputStyle,
                  borderColor: connectError ? "var(--red)" : "var(--border)",
                }}
                placeholder="https://domain.bitrix24.kz/rest/1/token/"
                value={webhookUrl}
                onChange={(e) => {
                  setWebhookUrl(e.target.value);
                  if (connectError) setConnectError(null);
                }}
                autoComplete="off"
              />
            </div>
            {connectError ? (
              <p className="text-[12px]" style={{ color: "var(--red)" }}>
                {connectError}
              </p>
            ) : null}
          </div>

          <div className="mt-4">
            <button
              type="button"
              disabled={loading !== null || !webhookUrl.trim()}
              onClick={connect}
              className="rounded-[8px] px-4 py-2 text-[13px] font-semibold transition-opacity disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#000000" }}
            >
              Проверить и подключить
            </button>
          </div>
        </>
      )}
    </div>
  );
}
