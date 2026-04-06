import { prisma } from "@/lib/prisma";

export type CrmSidebarStatus = {
  name: string;
  lastSync: string;
  connected: boolean;
};

function formatRelativeRu(d: Date | null): string {
  if (!d) return "нет данных";
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return "только что";
  if (sec < 3600) return `${Math.floor(sec / 60)} мин назад`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} ч назад`;
  return `${Math.floor(sec / 86400)} дн назад`;
}

function crmLabel(type: string): string {
  if (type === "bitrix24") return "Bitrix24";
  if (type === "amocrm") return "AmoCRM";
  return type;
}

export async function getSidebarData(): Promise<{
  leadsCount: number;
  crmConnections: CrmSidebarStatus[];
}> {
  try {
    const [leadsCount, connections] = await Promise.all([
      prisma.lead.count(),
      prisma.crmConnection.findMany({
        select: { crmType: true, lastSyncAt: true, isActive: true },
        orderBy: { crmType: "asc" },
      }),
    ]);

    const crmConnections: CrmSidebarStatus[] = connections.map((c) => ({
      name: crmLabel(c.crmType),
      lastSync: formatRelativeRu(c.lastSyncAt),
      connected: c.isActive,
    }));

    return { leadsCount, crmConnections };
  } catch {
    return {
      leadsCount: 0,
      crmConnections: [
        { name: "Bitrix24", lastSync: "—", connected: false },
        { name: "AmoCRM", lastSync: "—", connected: false },
      ],
    };
  }
}
