"use client";

import { useState } from "react";
import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { BitrixConnectForm } from "@/components/settings/bitrix-connect-form";
import { DashboardModulesPanel } from "@/components/settings/dashboard-modules-panel";
import { StageConfigPanel } from "@/components/settings/stage-config-panel";
import {
  AmoIntegrationCard,
  GoogleIntegrationCard,
  TelegramIntegrationCard,
} from "@/components/settings/integration-status-cards";
import type { CrmStatusResponse } from "@/lib/crm/status";

const TABS = [
  { key: "integrations", label: "Интеграции" },
  { key: "stages", label: "Воронки и этапы" },
  { key: "modules", label: "Модули дашборда" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

type Props = {
  crmStatus: CrmStatusResponse;
  bitrixInitial: {
    connectionId: string | null;
    domain: string | null;
    isActive: boolean;
    lastSyncAt: string | null;
    hasWebhook: boolean;
    profileUserId: string | null;
    managersCount: number;
    pipelinesCount: number;
  };
};

export function SettingsTabs({ crmStatus, bitrixInitial }: Props) {
  const [tab, setTab] = useState<TabKey>("integrations");

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b px-6 py-5" style={{ borderColor: "var(--border)" }}>
        <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
          Настройки и интеграции
        </h1>
        <p className="mt-0.5 text-[12px]" style={{ color: "var(--muted)" }}>
          CRM, вебхуки и API
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map((item) => {
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className="rounded-[8px] border px-3 py-2 text-[13px] font-medium"
                style={{
                  background: active ? "linear-gradient(135deg, #7B5CF5, #9B7FF8)" : "transparent",
                  color: active ? "#ffffff" : "#888888",
                  borderColor: active ? "transparent" : "var(--border)",
                  borderBottomColor: active ? "#C8FF00" : "var(--border2)",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        {tab === "integrations" ? (
          <>
            <BitrixConnectForm initial={bitrixInitial} statusInitial={crmStatus} />
            <AmoIntegrationCard statusInitial={crmStatus} />
            <TelegramIntegrationCard statusInitial={crmStatus} />
            <GoogleIntegrationCard statusInitial={crmStatus} />
          </>
        ) : null}

        {tab === "stages" ? <StageConfigPanel /> : null}
        {tab === "modules" ? <DashboardModulesPanel /> : null}

        <div className="glass max-w-2xl space-y-4 rounded-[18px] border p-5" style={{ borderColor: "var(--border)" }}>
          <p className="text-[13px]" style={{ color: "var(--muted)" }}>
            Секреты вебхуков хранятся в БД в зашифрованном виде (
            <code style={{ color: "var(--blue)" }}>ENCRYPTION_KEY</code>).
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <SignOutButton />
            <Link href="/" className="inline-block text-[13px] font-medium" style={{ color: "var(--blue)" }}>
              ← На главную
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
