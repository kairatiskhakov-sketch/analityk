import { encrypt, decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { normalizeUnifiedLead } from "@/lib/integrations/shared/mapper";
import { createAmoClient } from "./client";
import {
  amoFetchAllLeads,
  amoFetchAllUsers,
  amoListLossReasons,
  amoListPipelines,
} from "./methods";
import { mapAmoLeadToUnified } from "./mapper";
import { amoTokenExpiresAt, refreshAmoAccessToken } from "./oauth";

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export type AmoSyncResult = {
  leadsCount: number;
  managersCount: number;
};

async function ensureAmoAccessToken(
  conn: NonNullable<Awaited<ReturnType<typeof prisma.crmConnection.findUnique>>>,
): Promise<string> {
  if (!conn.amoSubdomain || !conn.amoAccessToken || !conn.amoRefreshToken) {
    throw new Error("AmoCRM: не заданы subdomain / токены");
  }
  if (!conn.amoClientId || !conn.amoClientSecret) {
    throw new Error("AmoCRM: не заданы client_id / client_secret");
  }

  const redirectUri = process.env.AMOCRM_REDIRECT_URI;
  if (!redirectUri) {
    throw new Error("AMOCRM_REDIRECT_URI не задан в окружении");
  }

  let access = decrypt(conn.amoAccessToken);
  const expiresAt = conn.amoTokenExpiresAt;

  const needRefresh =
    !expiresAt ||
    expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS;

  if (needRefresh) {
    const refreshed = await refreshAmoAccessToken(conn.amoSubdomain, {
      clientId: conn.amoClientId,
      clientSecret: decrypt(conn.amoClientSecret),
      refreshToken: decrypt(conn.amoRefreshToken),
      redirectUri,
    });

    access = refreshed.access_token;
    const newExpires = amoTokenExpiresAt(refreshed);

    await prisma.crmConnection.update({
      where: { id: conn.id },
      data: {
        amoAccessToken: encrypt(refreshed.access_token),
        amoRefreshToken: encrypt(refreshed.refresh_token),
        amoTokenExpiresAt: newExpires,
      },
    });
  }

  return access;
}

/** Для cron (каждые ~60 мин): обновить токен, если скоро истечёт. */
export async function refreshAmoTokensIfNeeded(
  connectionId: string,
): Promise<void> {
  const conn = await prisma.crmConnection.findUnique({
    where: { id: connectionId },
  });
  if (!conn || conn.crmType !== "amocrm" || !conn.isActive) return;
  await ensureAmoAccessToken(conn);
}

/**
 * Полная синхронизация лидов AmoCRM → БД.
 */
export async function syncAmoConnection(
  connectionId: string,
): Promise<AmoSyncResult> {
  const conn = await prisma.crmConnection.findUnique({
    where: { id: connectionId },
  });

  if (!conn || conn.crmType !== "amocrm") {
    throw new Error("Подключение AmoCRM не найдено");
  }
  if (!conn.isActive) {
    throw new Error("Интеграция AmoCRM выключена");
  }

  const accessToken = await ensureAmoAccessToken(conn);
  const client = createAmoClient(conn.amoSubdomain!, accessToken);

  const startedAt = new Date();

  const [pipelines, lossReasons, users] = await Promise.all([
    amoListPipelines(client),
    amoListLossReasons(client),
    amoFetchAllUsers(client),
  ]);

  const lossReasonById = new Map<number, string>();
  for (const r of lossReasons) {
    lossReasonById.set(r.id, r.name);
  }

  const managersByExt = new Map<string, string>();
  for (const u of users) {
    const ext = String(u.id);
    const mgr = await prisma.manager.upsert({
      where: {
        externalId_crmType: { externalId: ext, crmType: "amocrm" },
      },
      create: {
        externalId: ext,
        crmType: "amocrm",
        name: u.name?.trim() || "Менеджер",
        email: u.email ?? null,
      },
      update: {
        name: u.name?.trim() || "Менеджер",
        email: u.email ?? null,
      },
    });
    managersByExt.set(ext, mgr.id);
  }

  const leadsRows = await amoFetchAllLeads(client);
  const ctx = { pipelines, lossReasonById };

  for (const row of leadsRows) {
    const u = normalizeUnifiedLead(mapAmoLeadToUnified(row, ctx));
    const managerId = u.managerExternalId
      ? managersByExt.get(u.managerExternalId) ?? null
      : null;

    await prisma.lead.upsert({
      where: {
        externalId_crmType: {
          externalId: u.externalId,
          crmType: "amocrm",
        },
      },
      create: {
        externalId: u.externalId,
        crmType: "amocrm",
        connectionId: conn.id,
        name: u.name,
        phone: u.phone,
        email: u.email,
        source: u.source,
        utmSource: u.utmSource,
        utmMedium: u.utmMedium,
        utmCampaign: u.utmCampaign,
        utmContent: u.utmContent,
        gclid: u.gclid,
        fbclid: u.fbclid,
        managerId,
        status: u.status,
        amount: u.amount,
        failReason: u.failReason,
        createdAt: u.createdAt,
        closedAt: u.closedAt,
      },
      update: {
        name: u.name,
        phone: u.phone,
        email: u.email,
        source: u.source,
        utmSource: u.utmSource,
        utmMedium: u.utmMedium,
        utmCampaign: u.utmCampaign,
        utmContent: u.utmContent,
        gclid: u.gclid,
        fbclid: u.fbclid,
        managerId,
        status: u.status,
        amount: u.amount,
        failReason: u.failReason,
        createdAt: u.createdAt,
        closedAt: u.closedAt,
        syncedAt: new Date(),
      },
    });
  }

  const finishedAt = new Date();

  await prisma.crmConnection.update({
    where: { id: conn.id },
    data: { lastSyncAt: finishedAt },
  });

  await prisma.syncLog.create({
    data: {
      connectionId: conn.id,
      crmType: "amocrm",
      leadsCount: leadsRows.length,
      dealsCount: 0,
      startedAt,
      finishedAt,
    },
  });

  return {
    leadsCount: leadsRows.length,
    managersCount: managersByExt.size,
  };
}
