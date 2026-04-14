import { decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { createBitrix24Client } from "./client";
import type { BitrixStatusRow } from "./types";
import {
  bitrixCrmStatusList,
  bitrixDealCategoryGet,
  bitrixDealCategoryList,
  bitrixStatusListLeadLostReason,
  bitrixStatusListSource,
  fetchAllBitrixUsers,
} from "./methods";

function pickStr(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

/** Флаги стадии лида по Bitrix SEMANTICS / известным STATUS_ID */
function leadStageSemantics(row: BitrixStatusRow): {
  isSuccess: boolean;
  isLost: boolean;
} {
  const sid = (row.STATUS_ID ?? "").toUpperCase();
  const sem = (row.SEMANTICS ?? "").toUpperCase();
  if (sem === "S" || sid === "CONVERTED") return { isSuccess: true, isLost: false };
  if (sem === "F" || sid === "JUNK") return { isSuccess: false, isLost: true };
  return { isSuccess: false, isLost: false };
}

/** Флаги стадии сделки (воронка) */
function dealStageSemantics(row: BitrixStatusRow): {
  isSuccess: boolean;
  isLost: boolean;
} {
  const sem = (row.SEMANTICS ?? "").toUpperCase();
  const sid = (row.STATUS_ID ?? "").toUpperCase();
  if (sem === "S" || /:WON$|_WON$/i.test(sid)) {
    return { isSuccess: true, isLost: false };
  }
  if (sem === "F" || /:LOSE$|_LOSE$|LOST$/i.test(sid)) {
    return { isSuccess: false, isLost: true };
  }
  return { isSuccess: false, isLost: false };
}

export type BitrixSyncResult = {
  pipelinesCount: number;
  managersCount: number;
  dealsCategoriesCount: number;
  error?: string;
};

/**
 * Обновление кеша справочников Bitrix24 (воронки, стадии, менеджеры).
 * Лиды и сделки не сохраняются в БД — данные читаются из API в реальном времени.
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

  const [catRes, srcRes, lostRes] = await Promise.all([
    bitrixDealCategoryList(client),
    bitrixStatusListSource(client),
    bitrixStatusListLeadLostReason(client),
  ]);

  const usersRows = await fetchAllBitrixUsers(client, {
    filter: { ACTIVE: "Y" },
    select: ["ID", "NAME", "LAST_NAME", "EMAIL", "ACTIVE"],
  });
  console.log("Syncing managers (user.get ACTIVE=Y, paginated):", usersRows.length);
  console.log(
    "Manager IDs from Bitrix:",
    usersRows.map((u) => u.ID),
  );

  try {
    for (const row of srcRes.result ?? []) {
      const ext = pickStr(row.STATUS_ID);
      if (!ext) continue;
      const name = pickStr(row.NAME)?.trim() || ext;
      await prisma.crmDictionary.upsert({
        where: {
          crmType_entityId_externalId: {
            crmType: "bitrix24",
            entityId: "SOURCE",
            externalId: ext,
          },
        },
        create: {
          crmType: "bitrix24",
          entityId: "SOURCE",
          externalId: ext,
          name,
        },
        update: { name },
      });
    }
    for (const row of lostRes.result ?? []) {
      const ext = pickStr(row.STATUS_ID);
      if (!ext) continue;
      const name = pickStr(row.NAME)?.trim() || ext;
      await prisma.crmDictionary.upsert({
        where: {
          crmType_entityId_externalId: {
            crmType: "bitrix24",
            entityId: "LEAD_LOST_REASON",
            externalId: ext,
          },
        },
        create: {
          crmType: "bitrix24",
          entityId: "LEAD_LOST_REASON",
          externalId: ext,
          name,
        },
        update: { name },
      });
    }
    console.log("Bitrix24 справочники загружены:", {
      sources: srcRes.result?.length ?? 0,
      lostReasons: lostRes.result?.length ?? 0,
    });
  } catch (e) {
    console.warn(
      "Bitrix24: CrmDictionary (SOURCE / LEAD_LOST_REASON) не загружены:",
      e,
    );
  }

  try {
    const leadPipeRes = await bitrixCrmStatusList(client, {
      ENTITY_ID: "STATUS",
    });
    for (const row of leadPipeRes.result ?? []) {
      const ext = pickStr(row.STATUS_ID);
      if (!ext) continue;
      const { isSuccess, isLost } = leadStageSemantics(row);
      const sort = Number(row.SORT ?? 0);
      await prisma.pipelineStage.upsert({
        where: {
          connectionId_entityType_externalId_crmType: {
            connectionId: conn.id,
            entityType: "lead",
            externalId: ext,
            crmType: "bitrix24",
          },
        },
        create: {
          connectionId: conn.id,
          entityType: "lead",
          externalId: ext,
          name: pickStr(row.NAME)?.trim() || ext,
          sort: Number.isFinite(sort) ? sort : 0,
          isSuccess,
          isLost,
          color: pickStr(row.COLOR) ?? null,
          crmType: "bitrix24",
        },
        update: {
          name: pickStr(row.NAME)?.trim() || ext,
          sort: Number.isFinite(sort) ? sort : 0,
          isSuccess,
          isLost,
          color: pickStr(row.COLOR) ?? null,
        },
      });
    }
  } catch (e) {
    console.warn("Bitrix24: стадии лидов (crm.status.list STATUS) не загружены:", e);
  }

  const rawCategories = catRes.result;
  const fromApi = Array.isArray(rawCategories) && rawCategories.length > 0
    ? (rawCategories as Array<{
        ID?: string | number;
        NAME?: string;
        SORT?: number;
      }>)
    : [];

  let categoryZeroMeta: { NAME?: string; SORT?: number } | null = null;
  try {
    const zRes = await bitrixDealCategoryGet(client, { id: 0 });
    const r = zRes.result;
    if (r && typeof r === "object" && !Array.isArray(r)) {
      const row = r as { NAME?: unknown; SORT?: unknown };
      const nm = pickStr(row.NAME);
      categoryZeroMeta = {
        NAME: nm,
        SORT: Number(row.SORT ?? 0),
      };
    }
  } catch (e) {
    console.warn("Bitrix24: crm.dealcategory.get id=0:", e);
  }

  /** Основная воронка (0) не всегда приходит в crm.dealcategory.list — имя из crm.dealcategory.get */
  const categories: Array<{
    ID?: string | number;
    NAME?: string;
    SORT?: number;
  }> = [...fromApi];
  if (!categories.some((c) => String(c.ID ?? "") === "0")) {
    const zs =
      categoryZeroMeta?.SORT !== undefined &&
      Number.isFinite(Number(categoryZeroMeta.SORT))
        ? Number(categoryZeroMeta.SORT)
        : 0;
    categories.unshift({
      ID: "0",
      NAME: categoryZeroMeta?.NAME || "Квалификационная воронка",
      SORT: zs,
    });
  } else if (categoryZeroMeta) {
    const zi = categories.findIndex((c) => String(c.ID ?? "") === "0");
    if (zi >= 0) {
      categories[zi] = {
        ...categories[zi],
        ...(categoryZeroMeta.NAME ? { NAME: categoryZeroMeta.NAME } : {}),
        ...(categoryZeroMeta.SORT !== undefined &&
        Number.isFinite(Number(categoryZeroMeta.SORT))
          ? { SORT: Number(categoryZeroMeta.SORT) }
          : {}),
      };
    }
  }

  for (const cat of categories) {
    const catId = cat.ID != null ? String(cat.ID) : "0";
    const pname = pickStr(cat.NAME) || `Воронка ${catId}`;
    const psort = Number(cat.SORT ?? 0);
    await prisma.dealPipeline.upsert({
      where: {
        connectionId_externalId_crmType: {
          connectionId: conn.id,
          externalId: catId,
          crmType: "bitrix24",
        },
      },
      create: {
        connectionId: conn.id,
        externalId: catId,
        name: pname,
        sort: Number.isFinite(psort) ? psort : 0,
        crmType: "bitrix24",
      },
      update: {
        name: pname,
        sort: Number.isFinite(psort) ? psort : 0,
      },
    });
  }

  try {
    for (const cat of categories) {
      const catId = cat.ID != null ? String(cat.ID) : "0";
      let stRes =
        catId === "0"
          ? await bitrixCrmStatusList(client, {
              ENTITY_ID: "DEAL_STAGE",
              CATEGORY_ID: "0",
            })
          : await bitrixCrmStatusList(client, {
              ENTITY_ID: `DEAL_STAGE_${catId}`,
            });
      if ((stRes.result?.length ?? 0) === 0 && catId === "0") {
        stRes = await bitrixCrmStatusList(client, {
          ENTITY_ID: "DEAL_STAGE",
          CATEGORY_ID: 0,
        });
      }
      if ((stRes.result?.length ?? 0) === 0 && catId !== "0") {
        stRes = await bitrixCrmStatusList(client, {
          ENTITY_ID: "DEAL_STAGE",
          CATEGORY_ID: catId,
        });
      }
      for (const row of stRes.result ?? []) {
        const ext = pickStr(row.STATUS_ID);
        if (!ext) continue;
        const { isSuccess, isLost } = dealStageSemantics(row);
        const sort = Number(row.SORT ?? 0);
        await prisma.pipelineStage.upsert({
          where: {
            connectionId_entityType_externalId_crmType: {
              connectionId: conn.id,
              entityType: "deal",
              externalId: ext,
              crmType: "bitrix24",
            },
          },
          create: {
            connectionId: conn.id,
            entityType: "deal",
            externalId: ext,
            name: pickStr(row.NAME)?.trim() || ext,
            sort: Number.isFinite(sort) ? sort : 0,
            isSuccess,
            isLost,
            color: pickStr(row.COLOR) ?? null,
            categoryExternalId: catId,
            crmType: "bitrix24",
          },
          update: {
            name: pickStr(row.NAME)?.trim() || ext,
            sort: Number.isFinite(sort) ? sort : 0,
            isSuccess,
            isLost,
            color: pickStr(row.COLOR) ?? null,
            categoryExternalId: catId,
          },
        });
      }
    }
  } catch (e) {
    console.warn("Bitrix24: стадии сделок (DEAL_STAGE) не загружены:", e);
  }

  const removedManagers = await prisma.manager.deleteMany({
    where: { crmType: "bitrix24" },
  });
  console.warn(
    "Bitrix24 sync: удалены записи Manager (bitrix24) перед пересборкой из user.get:",
    removedManagers.count,
    "(PlanTarget по менеджерам — onDelete: Cascade)",
  );

  let managersCount = 0;
  for (const u of usersRows) {
    const ext = u.ID ? String(u.ID) : "";
    if (!ext) continue;
    const name =
      [u.NAME, u.LAST_NAME].filter(Boolean).join(" ").trim() || "Менеджер";
    const a = u.ACTIVE;
    const isActive =
      a === false ||
      a === "N" ||
      a === "n" ||
      a === 0 ||
      a === "0"
        ? false
        : true;

    /** externalId = Bitrix user.ID (user.get), совпадает с ASSIGNED_BY_ID в сделках. */
    await prisma.manager.upsert({
      where: {
        externalId_crmType: { externalId: ext, crmType: "bitrix24" },
      },
      create: {
        externalId: ext,
        crmType: "bitrix24",
        name,
        email: u.EMAIL ?? null,
        isActive,
      },
      update: { name, email: u.EMAIL ?? null, isActive },
    });
    managersCount += 1;
  }

  const finishedAt = new Date();
  await prisma.crmConnection.update({
    where: { id: conn.id },
    data: { lastSyncAt: finishedAt },
  });

  const dealsCategoriesCount = categories.length;

  const pipelinesCount = categories.length;

  return {
    pipelinesCount,
    managersCount,
    dealsCategoriesCount,
  };
}
