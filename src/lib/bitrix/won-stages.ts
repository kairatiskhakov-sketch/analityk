import { BitrixAPI } from "@/lib/bitrix/api";
import { prisma } from "@/lib/prisma";
import { DEFAULT_ORG_ID } from "@/lib/org/context";

/**
 * ID стадий «выиграна» для Bitrix24: сначала CrmDictionary (WON_STAGE),
 * иначе загрузка из crm.status.list по ключевым словам и кеш в БД.
 */
export async function getOrSyncWonStageIds(
  webhookUrl: string,
  orgId: string = DEFAULT_ORG_ID,
): Promise<string[]> {
  const cached = await prisma.crmDictionary.findMany({
    where: { orgId, crmType: "bitrix24", entityId: "WON_STAGE" },
    select: { externalId: true },
  });
  if (cached.length > 0) {
    return cached.map((c) => c.externalId);
  }

  const api = new BitrixAPI(webhookUrl);
  const entries = await api.getWonStageEntries();
  for (const e of entries) {
    await prisma.crmDictionary.upsert({
      where: {
        orgId_crmType_entityId_externalId: {
          orgId,
          crmType: "bitrix24",
          entityId: "WON_STAGE",
          externalId: e.id,
        },
      },
      create: {
        orgId,
        crmType: "bitrix24",
        entityId: "WON_STAGE",
        externalId: e.id,
        name: e.name,
      },
      update: { name: e.name },
    });
  }
  return entries.map((e) => e.id);
}
