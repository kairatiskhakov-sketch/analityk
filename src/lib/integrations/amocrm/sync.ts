import { encrypt, decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { DEFAULT_ORG_ID } from "@/lib/org/context";
import { createAmoClient } from "./client";
import { AMO_STATUS_LOST, AMO_STATUS_WON, amoStatusType } from "./mapper";
import {
  amoFetchAllUsers,
  fetchAmoLossReasons,
  fetchAmoPipelines,
} from "./methods";
import { amoTokenExpiresAt, refreshAmoAccessToken } from "./oauth";

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export type AmoSyncResult = {
  pipelinesCount: number;
  lossReasonsCount: number;
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
 * Кеш менеджеров AmoCRM в таблице Manager. Лиды в БД не сохраняются.
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
  const orgId = conn.orgId ?? DEFAULT_ORG_ID;

  const accessToken = await ensureAmoAccessToken(conn);
  const client = createAmoClient(conn.amoSubdomain!, accessToken);

  const [pipelines, lossReasons, users] = await Promise.all([
    fetchAmoPipelines(accessToken, conn.amoSubdomain!),
    fetchAmoLossReasons(accessToken, conn.amoSubdomain!),
    amoFetchAllUsers(client),
  ]);

  let pipelinesCount = 0;
  for (const p of pipelines) {
    for (const st of p._embedded?.statuses ?? []) {
      const inferred =
        st.id === AMO_STATUS_WON
          ? "won"
          : st.id === AMO_STATUS_LOST
            ? "lost"
            : amoStatusType(st);
      const type = inferred === "ignore" ? "ignore" : inferred;
      await prisma.stageConfig.upsert({
        where: {
          orgId_externalId_crmType: {
            orgId,
            externalId: String(st.id),
            crmType: "amocrm",
          },
        },
        create: {
          orgId,
          externalId: String(st.id),
          name: st.name || `Статус ${st.id}`,
          pipelineId: String(p.id),
          pipelineName: p.name || `Воронка ${p.id}`,
          crmType: "amocrm",
          type,
          sort: Number(st.sort ?? 0),
          color: st.color ?? null,
        },
        update: {
          name: st.name || `Статус ${st.id}`,
          pipelineId: String(p.id),
          pipelineName: p.name || `Воронка ${p.id}`,
          type,
          sort: Number(st.sort ?? 0),
          color: st.color ?? null,
        },
      });
      pipelinesCount += 1;
    }
  }

  let lossReasonsCount = 0;
  for (const lr of lossReasons) {
    const ext = String(lr.id);
    const name = lr.name?.trim() || ext;
    await prisma.crmDictionary.upsert({
      where: {
        orgId_crmType_entityId_externalId: {
          orgId,
          crmType: "amocrm",
          entityId: "LOST_REASON",
          externalId: ext,
        },
      },
      create: {
        orgId,
        crmType: "amocrm",
        entityId: "LOST_REASON",
        externalId: ext,
        name,
      },
      update: { name },
    });
    lossReasonsCount += 1;
  }

  let managersCount = 0;
  for (const u of users) {
    const ext = String(u.id);
    await prisma.manager.upsert({
      where: {
        orgId_externalId_crmType: { orgId, externalId: ext, crmType: "amocrm" },
      },
      create: {
        orgId,
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
    managersCount += 1;
  }

  await prisma.crmConnection.update({
    where: { id: conn.id },
    data: { lastSyncAt: new Date() },
  });

  return { pipelinesCount, lossReasonsCount, managersCount };
}
