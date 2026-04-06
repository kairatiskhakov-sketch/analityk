import { decrypt, encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import type { GoogleConnection } from "@prisma/client";
import { refreshGoogleAccessToken } from "./oauth";

const BUFFER_MS = 5 * 60 * 1000;

/**
 * Актуальный access_token; при необходимости refresh и запись в БД.
 */
export async function getGoogleAccessToken(
  connectionId: string,
): Promise<{ accessToken: string; connection: GoogleConnection }> {
  const conn = await prisma.googleConnection.findUnique({
    where: { id: connectionId },
  });
  if (!conn) {
    throw new Error("Google подключение не найдено");
  }

  const refreshPlain = decrypt(conn.refreshToken);
  let accessPlain = decrypt(conn.accessToken);

  if (conn.tokenExpiresAt.getTime() - Date.now() < BUFFER_MS) {
    const creds = await refreshGoogleAccessToken(refreshPlain);
    if (!creds.access_token) {
      throw new Error("Google: не удалось обновить access_token");
    }
    accessPlain = creds.access_token;
    const expiryMs = creds.expiry_date ?? Date.now() + 3600 * 1000;
    const newRefresh = creds.refresh_token ?? refreshPlain;

    await prisma.googleConnection.update({
      where: { id: conn.id },
      data: {
        accessToken: encrypt(accessPlain),
        refreshToken: encrypt(newRefresh),
        tokenExpiresAt: new Date(expiryMs),
      },
    });

    const updated = await prisma.googleConnection.findUniqueOrThrow({
      where: { id: conn.id },
    });
    return { accessToken: accessPlain, connection: updated };
  }

  return { accessToken: accessPlain, connection: conn };
}
