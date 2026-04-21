import { BitrixAPI } from "@/lib/bitrix/api";
import { prisma } from "@/lib/prisma";
import { DEFAULT_ORG_ID } from "@/lib/org/context";

/** Если в БД нет строк справочника — подтягиваем из Bitrix и upsert в CrmDictionary. */
export async function ensureBitrixLeadDictionaries(
  webhookUrl: string,
  orgId: string = DEFAULT_ORG_ID,
): Promise<void> {
  const [srcCount, lostCount] = await Promise.all([
    prisma.crmDictionary.count({
      where: { orgId, crmType: "bitrix24", entityId: "SOURCE" },
    }),
    prisma.crmDictionary.count({
      where: {
        orgId,
        crmType: "bitrix24",
        entityId: { in: ["LEAD_LOST_REASON", "LOST_REASON"] },
      },
    }),
  ]);

  const api = new BitrixAPI(webhookUrl);

  if (srcCount === 0) {
    const rows = await api.getSources();
    for (const r of rows) {
      await prisma.crmDictionary.upsert({
        where: {
          orgId_crmType_entityId_externalId: {
            orgId,
            crmType: "bitrix24",
            entityId: "SOURCE",
            externalId: r.id,
          },
        },
        create: {
          orgId,
          crmType: "bitrix24",
          entityId: "SOURCE",
          externalId: r.id,
          name: r.name,
        },
        update: { name: r.name },
      });
    }
  }

  if (lostCount === 0) {
    const rows = await api.getLostReasons();
    for (const r of rows) {
      await prisma.crmDictionary.upsert({
        where: {
          orgId_crmType_entityId_externalId: {
            orgId,
            crmType: "bitrix24",
            entityId: "LEAD_LOST_REASON",
            externalId: r.id,
          },
        },
        create: {
          orgId,
          crmType: "bitrix24",
          entityId: "LEAD_LOST_REASON",
          externalId: r.id,
          name: r.name,
        },
        update: { name: r.name },
      });
    }
  }
}

/** Подмешивает названия из кеша БД (приоритет над API). */
export async function mergeBitrixDictionaryMaps(
  lostFromApi: Map<string, string>,
  srcFromApi: Map<string, string>,
  orgId: string = DEFAULT_ORG_ID,
): Promise<{ lostMap: Map<string, string>; srcMap: Map<string, string> }> {
  const rows = await prisma.crmDictionary.findMany({
    where: { orgId, crmType: "bitrix24" },
  });
  const lostMap = new Map(lostFromApi);
  const srcMap = new Map(srcFromApi);
  for (const r of rows) {
    if (r.entityId === "SOURCE") {
      srcMap.set(r.externalId, r.name);
      srcMap.set(r.externalId.toUpperCase(), r.name);
    }
    if (r.entityId === "LOST_REASON" || r.entityId === "LEAD_LOST_REASON") {
      lostMap.set(r.externalId, r.name);
      lostMap.set(r.externalId.toUpperCase(), r.name);
    }
  }
  return { lostMap, srcMap };
}
