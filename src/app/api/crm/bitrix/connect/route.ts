import { encrypt } from "@/lib/crypto";
import { autoLoadStageConfigs } from "@/lib/bitrix/auto-stage-config";
import { jsonError, jsonOk } from "@/lib/http/json";
import { normalizeBitrixDomain } from "@/lib/integrations/bitrix24/client";
import { parseBitrixWebhookUrl } from "@/lib/integrations/bitrix24/parse-webhook";
import { syncBitrix24Connection } from "@/lib/integrations/bitrix24/sync";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Body = {
  webhookUrl?: string;
};

type BitrixProfileResult = {
  result?: { ID?: string | number };
  error?: string;
  error_description?: string;
};

async function fetchBitrixProfile(webhookBase: string): Promise<BitrixProfileResult> {
  const base = webhookBase.trim().replace(/\/?$/, "/");
  const res = await fetch(`${base}profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    cache: "no-store",
  });
  const data = (await res.json()) as BitrixProfileResult;
  if (!res.ok) {
    throw new Error(
      data.error_description ?? data.error ?? `HTTP ${res.status}`,
    );
  }
  return data;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const raw = body.webhookUrl?.trim();
    if (!raw) {
      return jsonError("Укажите URL вебхука", 400);
    }
    if (!raw.startsWith("https://")) {
      return jsonError("Некорректный URL вебхука (нужен https://)", 400);
    }

    let parsed: ReturnType<typeof parseBitrixWebhookUrl>;
    try {
      parsed = parseBitrixWebhookUrl(raw);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Неверный формат URL";
      return jsonError(msg, 400);
    }

    let profileData: BitrixProfileResult;
    try {
      profileData = await fetchBitrixProfile(raw);
    } catch {
      return jsonError(
        "Bitrix24 не ответил. Проверь URL и права вебхука.",
        400,
      );
    }

    const profileId = profileData.result?.ID;
    if (profileId == null || profileId === "") {
      return jsonError(
        "Bitrix24 не ответил. Проверь URL и права вебхука.",
        400,
      );
    }

    const domain = normalizeBitrixDomain(parsed.domain);
    const enc = encrypt(parsed.webhookToken);
    const profileUserId = String(profileId);

    const existing = await prisma.crmConnection.findFirst({
      where: { crmType: "bitrix24" },
    });

    const connection = existing
      ? await prisma.crmConnection.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            bitrixDomain: domain,
            bitrixUserId: parsed.userId,
            bitrixWebhookToken: enc,
            bitrixProfileUserId: profileUserId,
            lastSyncAt: new Date(),
          },
        })
      : await prisma.crmConnection.create({
          data: {
            crmType: "bitrix24",
            isActive: true,
            bitrixDomain: domain,
            bitrixUserId: parsed.userId,
            bitrixWebhookToken: enc,
            bitrixProfileUserId: profileUserId,
            lastSyncAt: new Date(),
          },
        });

    let loadedStages = 0;
    try {
      await syncBitrix24Connection(connection.id);
      loadedStages = await autoLoadStageConfigs(raw);
    } catch (err) {
      console.error("Bitrix24 initial sync:", err);
    }

    return jsonOk({
      success: true,
      domain,
      userId: profileUserId,
      connectionId: connection.id,
      loadedStages,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Не удалось подключиться к Bitrix24";
    return jsonError(msg, 500);
  }
}
