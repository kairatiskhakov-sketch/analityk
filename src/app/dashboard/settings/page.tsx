import { SettingsTabs } from "@/components/settings/settings-tabs";
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

  return <SettingsTabs crmStatus={crmStatus} bitrixInitial={bitrixInitial} />;
}
