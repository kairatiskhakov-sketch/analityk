/**
 * Attribution backfill — ретро-матчинг CRM-сделок к tracking-touches.
 *
 * Зачем:
 *  - Тrack-сниппет мог быть подключён позже, чем в CRM начали копиться сделки.
 *  - На момент webhook'а рекламный click_id ещё не был записан в UF CRM.
 *  - UF-поле могло быть добавлено/заполнено автоматикой CRM после создания сделки.
 *
 * Что делаем:
 *  1) Находим LeadAttribution с `touchId = null` для орг-ы (по желанию фильтр по crmType).
 *  2) Для каждой строки дёргаем существующий per-CRM attribution helper
 *     (`attributeBitrixEntity` / `attributeAmoLead`), который:
 *       - вытянет свежие UF/custom-поля из CRM,
 *       - вызовет `attributeLead`,
 *       - апсертнёт новую запись с актуальным touchId/campaignId/confidence.
 *  3) Возвращаем статистику: сколько проверено, сколько действительно
 *     получили touchId впервые, сколько осталось "без изменений", ошибки.
 *
 * Ограничения:
 *  - Для привязки к CRM-подключению берём первое active CrmConnection
 *    орга по crmType. Если нужна multi-connection модель — потребуется
 *    переделка: сейчас нет FK из LeadAttribution на CrmConnection.
 *  - Последовательный обход с паузой 40ms между вызовами — чтобы не
 *    упереться в rate-limit Bitrix/Amo API.
 */

import { prisma } from "@/lib/prisma";
import { attributeBitrixEntity } from "@/lib/integrations/bitrix24/attribution";
import { attributeAmoLead } from "@/lib/integrations/amocrm/attribution";

export type AttributionBackfillInput = {
  orgId: string;
  /** Ограничить по типу CRM (по умолчанию — все активные для орга). */
  crmType?: "bitrix24" | "amocrm";
  /** Максимум сделок за один запуск. По умолчанию 200 — безопасно для cron. */
  limit?: number;
};

export type AttributionBackfillResult = {
  scanned: number;
  matched: number;
  unchanged: number;
  errors: number;
  errorSamples: string[]; // до 5 штук
};

const INTER_CALL_DELAY_MS = 40;

async function pickConnectionId(
  orgId: string,
  crmType: string,
): Promise<string | null> {
  const conn = await prisma.crmConnection.findFirst({
    where: { orgId, crmType, isActive: true },
    select: { id: true },
    orderBy: { lastSyncAt: "desc" },
  });
  return conn?.id ?? null;
}

export async function runAttributionBackfill(
  input: AttributionBackfillInput,
): Promise<AttributionBackfillResult> {
  const limit = Math.max(1, Math.min(input.limit ?? 200, 2000));

  const rows = await prisma.leadAttribution.findMany({
    where: {
      orgId: input.orgId,
      touchId: null,
      ...(input.crmType ? { crmType: input.crmType } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { crmDealId: true, crmType: true },
  });

  // Кэшируем выбор connectionId по crmType, чтобы не ходить в БД на каждой итерации.
  const connCache = new Map<string, string | null>();
  const getConn = async (crmType: string): Promise<string | null> => {
    if (connCache.has(crmType)) return connCache.get(crmType)!;
    const id = await pickConnectionId(input.orgId, crmType);
    connCache.set(crmType, id);
    return id;
  };

  let matched = 0;
  let unchanged = 0;
  let errors = 0;
  const errorSamples: string[] = [];

  for (const row of rows) {
    try {
      const connId = await getConn(row.crmType);
      if (!connId) {
        unchanged++;
        continue;
      }

      let res;
      if (row.crmType === "bitrix24") {
        res = await attributeBitrixEntity(connId, "deal", row.crmDealId);
      } else if (row.crmType === "amocrm") {
        res = await attributeAmoLead(connId, row.crmDealId);
      } else {
        unchanged++;
        continue;
      }

      if (res?.touchId) matched++;
      else unchanged++;
    } catch (e) {
      errors++;
      if (errorSamples.length < 5) {
        errorSamples.push(
          `${row.crmType}#${row.crmDealId}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }

    // Мягкая пауза, чтобы не налететь на CRM rate-limit.
    if (INTER_CALL_DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, INTER_CALL_DELAY_MS));
    }
  }

  return {
    scanned: rows.length,
    matched,
    unchanged,
    errors,
    errorSamples,
  };
}
