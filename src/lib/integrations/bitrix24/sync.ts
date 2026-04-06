import { decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { normalizeUnifiedLead } from "@/lib/integrations/shared/mapper";
import { createBitrix24Client } from "./client";
import {
  bitrixDealCategoryList,
  bitrixStatusListLeadLostReason,
  bitrixStatusListSource,
  bitrixUserGet,
  fetchAllDeals,
  fetchAllLeads,
} from "./methods";
import { mapBitrixDealToUnified, mapBitrixLeadToUnified } from "./mapper";

const LEAD_SELECT = [
  "ID",
  "TITLE",
  "SOURCE_ID",
  "ASSIGNED_BY_ID",
  "STATUS_ID",
  "OPPORTUNITY",
  "CURRENCY_ID",
  "CREATED_TIME",
  "CLOSED_TIME",
  "COMMENTS",
  "LOST_REASON_ID",
  "PHONE",
  "EMAIL",
] as const;

const DEAL_SELECT = [
  "ID",
  "TITLE",
  "OPPORTUNITY",
  "SOURCE_ID",
  "ASSIGNED_BY_ID",
  "DATE_CREATE",
  "CLOSEDATE",
  "STAGE_ID",
] as const;

export type BitrixSyncResult = {
  leadsCount: number;
  dealsCount: number;
  dealsCategoriesCount: number;
  error?: string;
};

/**
 * Полная синхронизация лидов и сделок по входящему вебхуку Bitrix24.
 * Токен в БД в зашифрованном виде.
 */
export async function syncBitrix24Connection(
  connectionId: string,
): Promise<BitrixSyncResult> {
  const conn = await prisma.crmConnection.findUnique({
    where: { id: connectionId },
  });
  if (!conn || conn.crmType !== "bitrix24") {
    throw new Error("Подключение Bitrix24 не найдено");
  }
  if (!conn.isActive) {
    throw new Error("Интеграция Bitrix24 выключена");
  }

  const token = conn.bitrixWebhookToken
    ? decrypt(conn.bitrixWebhookToken)
    : null;
  if (!conn.bitrixDomain || !conn.bitrixUserId || !token) {
    throw new Error("Не заданы domain / userId / webhook Bitrix24");
  }

  const client = createBitrix24Client({
    domain: conn.bitrixDomain,
    userId: conn.bitrixUserId,
    webhookToken: token,
  });

  const startedAt = new Date();

  const [srcRes, lostRes, usersRes, catRes] = await Promise.all([
    bitrixStatusListSource(client),
    bitrixStatusListLeadLostReason(client),
    bitrixUserGet(client),
    bitrixDealCategoryList(client),
  ]);

  const sourceMap = new Map<string, string>();
  for (const s of srcRes.result ?? []) {
    if (s.STATUS_ID && s.NAME) sourceMap.set(s.STATUS_ID, s.NAME);
  }
  const lostMap = new Map<string, string>();
  for (const s of lostRes.result ?? []) {
    if (s.STATUS_ID && s.NAME) lostMap.set(s.STATUS_ID, s.NAME);
  }

  const managersByExt = new Map<string, string>();

  for (const u of usersRes.result ?? []) {
    const ext = u.ID ? String(u.ID) : "";
    if (!ext) continue;
    const name =
      [u.NAME, u.LAST_NAME].filter(Boolean).join(" ").trim() || "Менеджер";
    const mgr = await prisma.manager.upsert({
      where: {
        externalId_crmType: { externalId: ext, crmType: "bitrix24" },
      },
      create: {
        externalId: ext,
        crmType: "bitrix24",
        name,
        email: u.EMAIL ?? null,
      },
      update: { name, email: u.EMAIL ?? null },
    });
    managersByExt.set(ext, mgr.id);
  }

  const leadsRows = await fetchAllLeads(client, {
    select: [...LEAD_SELECT],
    filter: {},
    order: { DATE_CREATE: "DESC" },
  });

  const dealsRows = await fetchAllDeals(client, {
    select: [...DEAL_SELECT],
    filter: {},
    order: { DATE_CREATE: "DESC" },
  });

  const maps = { sourceById: sourceMap, lostReasonById: lostMap };

  for (const row of leadsRows) {
    const u = normalizeUnifiedLead(mapBitrixLeadToUnified(row, maps));
    const managerId = u.managerExternalId
      ? managersByExt.get(u.managerExternalId) ?? null
      : null;

    await prisma.lead.upsert({
      where: {
        externalId_crmType: {
          externalId: u.externalId,
          crmType: "bitrix24",
        },
      },
      create: {
        externalId: u.externalId,
        crmType: "bitrix24",
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

  for (const row of dealsRows) {
    const d = mapBitrixDealToUnified(row, sourceMap);
    const managerId = d.managerExternalId
      ? managersByExt.get(d.managerExternalId) ?? null
      : null;

    await prisma.deal.upsert({
      where: {
        externalId_crmType: {
          externalId: d.externalId,
          crmType: "bitrix24",
        },
      },
      create: {
        externalId: d.externalId,
        crmType: "bitrix24",
        connectionId: conn.id,
        managerId,
        amount: d.amount,
        source: d.source,
        createdAt: d.createdAt,
        closedAt: d.closedAt,
      },
      update: {
        managerId,
        amount: d.amount,
        source: d.source,
        createdAt: d.createdAt,
        closedAt: d.closedAt,
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
      crmType: "bitrix24",
      leadsCount: leadsRows.length,
      dealsCount: dealsRows.length,
      startedAt,
      finishedAt,
    },
  });

  const categories = catRes.result;
  const dealsCategoriesCount = Array.isArray(categories) ? categories.length : 0;

  return {
    leadsCount: leadsRows.length,
    dealsCount: dealsRows.length,
    dealsCategoriesCount,
  };
}
