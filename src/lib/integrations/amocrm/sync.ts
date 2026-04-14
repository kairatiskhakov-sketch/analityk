import { encrypt, decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { createAmoClient } from "./client";
import { amoFetchAllUsers } from "./methods";
import { amoTokenExpiresAt, refreshAmoAccessToken } from "./oauth";

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export type AmoSyncResult = {
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

  const accessToken = await ensureAmoAccessToken(conn);
  const client = createAmoClient(conn.amoSubdomain!, accessToken);

  const users = await amoFetchAllUsers(client);

  let managersCount = 0;
  for (const u of users) {
    const ext = String(u.id);
    await prisma.manager.upsert({
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
    managersCount += 1;
  }

  await prisma.crmConnection.update({
    where: { id: conn.id },
    data: { lastSyncAt: new Date() },
  });

  return { managersCount };
}
