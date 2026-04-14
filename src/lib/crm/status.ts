import { prisma } from "@/lib/prisma";

export type CrmStatusResponse = {
  leadsTotal: number;
  bitrix: {
    connected: boolean;
    lastSync: string | null;
    live: boolean;
    domain: string | null;
    connectionId: string | null;
  };
  amo: {
    connected: boolean;
    lastSync: string | null;
    domain: string | null;
    connectionId: string | null;
    /** @deprecated лиды не хранятся в БД */
    leadsCount: number;
    dealsCount: number;
  };
  telegram: {
    connected: boolean;
    connectionId: string | null;
  };
  google: {
    connected: boolean;
    connectionId: string | null;
    email: string | null;
  };
};

export async function getCrmStatusSnapshot(): Promise<CrmStatusResponse> {
  const [bitrixConn, amoConn, telegramConn, googleConn] = await Promise.all([
    prisma.crmConnection.findFirst({ where: { crmType: "bitrix24" } }),
    prisma.crmConnection.findFirst({ where: { crmType: "amocrm" } }),
    prisma.telegramConnection.findFirst(),
    prisma.googleConnection.findFirst(),
  ]);

  const bitrixConnected = Boolean(
    bitrixConn?.isActive &&
      bitrixConn.bitrixWebhookToken &&
      bitrixConn.bitrixDomain,
  );
  const amoConnected = Boolean(
    amoConn?.isActive && amoConn.amoAccessToken,
  );
  const telegramConnected = Boolean(
    telegramConn?.isActive && telegramConn.botToken,
  );
  const googleConnected = Boolean(googleConn?.email);

  return {
    leadsTotal: 0,
    bitrix: {
      connected: bitrixConnected,
      lastSync: bitrixConn?.lastSyncAt?.toISOString() ?? null,
      live: bitrixConnected,
      domain: bitrixConn?.bitrixDomain ?? null,
      connectionId: bitrixConn?.id ?? null,
    },
    amo: {
      connected: amoConnected,
      lastSync: amoConn?.lastSyncAt?.toISOString() ?? null,
      domain: amoConn?.amoSubdomain ?? null,
      connectionId: amoConn?.id ?? null,
      leadsCount: 0,
      dealsCount: 0,
    },
    telegram: {
      connected: telegramConnected,
      connectionId: telegramConn?.id ?? null,
    },
    google: {
      connected: googleConnected,
      connectionId: googleConn?.id ?? null,
      email: googleConn?.email ?? null,
    },
  };
}
