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
import { getCrmStatusSnapshot } from "@/lib/crm/status";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const crmStatus = await getCrmStatusSnapshot();

  const bitrix = await prisma.crmConnection.findFirst({
    where: { crmType: "bitrix24" },
    select: {
      id: true,
      bitrixDomain: true,
      isActive: true,
      lastSyncAt: true,
      bitrixWebhookToken: true,
      bitrixProfileUserId: true,
    },
  });

  const [managersCount, pipelinesCount] = bitrix
    ? await Promise.all([
        prisma.manager.count({ where: { crmType: "bitrix24" } }),
        prisma.dealPipeline.count({
          where: { connectionId: bitrix.id, crmType: "bitrix24" },
        }),
      ])
    : [0, 0];

  const bitrixInitial = {
    connectionId: bitrix?.id ?? null,
    domain: bitrix?.bitrixDomain ?? null,
    isActive: bitrix?.isActive ?? false,
    lastSyncAt: bitrix?.lastSyncAt?.toISOString() ?? null,
    hasWebhook: Boolean(bitrix?.bitrixWebhookToken),
    profileUserId: bitrix?.bitrixProfileUserId ?? null,
    managersCount,
    pipelinesCount,
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div
        className="border-b px-6 py-5"
        style={{ borderColor: "var(--border)" }}
      >
        <h1
          className="text-[20px] font-semibold tracking-tight"
          style={{ color: "var(--text)" }}
        >
          Настройки и интеграции
        </h1>
        <p className="mt-0.5 text-[12px]" style={{ color: "var(--muted)" }}>
          CRM, вебхуки и API
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        <DashboardModulesPanel />

        <StageConfigPanel />

        <BitrixConnectForm initial={bitrixInitial} statusInitial={crmStatus} />

        <AmoIntegrationCard statusInitial={crmStatus} />
        <TelegramIntegrationCard statusInitial={crmStatus} />
        <GoogleIntegrationCard statusInitial={crmStatus} />

        <div
          className="max-w-2xl space-y-4 rounded-[12px] border p-5"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
          }}
        >
          <p className="text-[13px]" style={{ color: "var(--muted)" }}>
            Секреты вебхуков хранятся в БД в зашифрованном виде (
            <code style={{ color: "var(--blue)" }}>ENCRYPTION_KEY</code>).
          </p>
          <ul className="list-inside list-disc space-y-2 text-[13px]" style={{ color: "var(--muted)" }}>
            <li>
              <strong style={{ color: "var(--text)" }}>AmoCRM</strong> —{" "}
              <code className="text-[12px]">/api/crm/amo/connect</code>
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>Google</strong> —{" "}
              <code className="text-[12px]">/api/integrations/google/register</code>
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>Telegram</strong> —{" "}
              <code className="text-[12px]">/api/integrations/telegram/connect</code>
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>Cron</strong> —{" "}
              <code className="text-[12px]">POST /api/cron</code> с{" "}
              <code>Authorization: Bearer CRON_SECRET</code>
            </li>
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <SignOutButton />
            <Link
              href="/"
              className="inline-block text-[13px] font-medium"
              style={{ color: "var(--blue)" }}
            >
              ← На главную
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
