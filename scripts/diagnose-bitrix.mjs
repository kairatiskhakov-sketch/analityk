#!/usr/bin/env node
// Диагностика структуры Bitrix24 для понимания как хранятся причины отказа.
// Запуск: node scripts/diagnose-bitrix.mjs

const WEBHOOK = "https://higroup.bitrix24.kz/rest/5701/duu385n5a5j62oai/";

async function call(method, params = {}) {
  const url = new URL(method, WEBHOOK.endsWith("/") ? WEBHOOK : WEBHOOK + "/");
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error_description || json.error}`);
  return json;
}

function section(title) {
  console.log("\n" + "=".repeat(70));
  console.log(title);
  console.log("=".repeat(70));
}

async function main() {
  // 1. Все типы справочников
  section("1) Доступные ENTITY_ID в crm.status.entity.types");
  try {
    const types = await call("crm.status.entity.types");
    for (const t of types.result ?? []) {
      console.log(`  ${t.ID.padEnd(25)} — ${t.NAME}`);
    }
  } catch (e) {
    console.log("  ERR:", e.message);
  }

  // 2. Воронки сделок
  section("2) Воронки (crm.dealcategory.list)");
  const cats = await call("crm.dealcategory.list", { select: ["ID", "NAME", "IS_LOCKED"] });
  const categories = cats.result ?? [];
  console.log("  + воронка по умолчанию (ID=0)");
  for (const c of categories) {
    console.log(`  ID=${c.ID}  ${c.NAME}`);
  }

  // 3. F-стадии по каждой воронке
  section("3) Стадии с SEMANTICS=F (провал) по воронкам");
  const allEntities = ["DEAL_STAGE", ...categories.map((c) => `DEAL_STAGE_${c.ID}`)];
  for (const entity of allEntities) {
    try {
      const stages = await call("crm.status.list", {
        filter: { ENTITY_ID: entity },
        order: { SORT: "ASC" },
      });
      const failStages = (stages.result ?? []).filter((s) => s.SEMANTICS === "F");
      if (failStages.length === 0) {
        console.log(`  ${entity}: нет F-стадий`);
      } else {
        console.log(`  ${entity}:`);
        for (const s of failStages) {
          console.log(`    STATUS_ID=${s.STATUS_ID.padEnd(30)} NAME=${s.NAME}`);
        }
      }
    } catch (e) {
      console.log(`  ${entity}: ERR ${e.message}`);
    }
  }

  // 4. UF-поля на сделках
  section("4) Кастомные UF-поля сделки (crm.deal.userfield.list)");
  try {
    const uf = await call("crm.deal.userfield.list", { order: { SORT: "ASC" } });
    const fields = uf.result ?? [];
    const candidates = fields.filter(
      (f) =>
        /LOSS|REASON|FAIL|ОТКАЗ|ПРИЧИН/i.test(f.FIELD_NAME) ||
        /LOSS|REASON|FAIL|ОТКАЗ|ПРИЧИН/i.test(
          f.LIST_COLUMN_LABEL?.ru || f.EDIT_FORM_LABEL?.ru || "",
        ),
    );
    if (candidates.length === 0) {
      console.log("  Нет UF-полей похожих на причину отказа");
      console.log("  Всего UF-полей на сделке:", fields.length);
      for (const f of fields.slice(0, 30)) {
        console.log(`    ${f.FIELD_NAME}  (${f.USER_TYPE_ID})  ${f.EDIT_FORM_LABEL?.ru || ""}`);
      }
    } else {
      for (const f of candidates) {
        console.log(
          `  ${f.FIELD_NAME}  type=${f.USER_TYPE_ID}  label="${f.EDIT_FORM_LABEL?.ru || f.LIST_COLUMN_LABEL?.ru || ""}"`,
        );
      }
    }
  } catch (e) {
    console.log("  ERR:", e.message);
  }

  // 5. Смотрим реальные сделки за 30 дней: есть ли LOSS_REASON_ID
  section("5) Анализ последних сделок: LOSS_REASON_ID vs STAGE_ID");
  const dateFrom = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const batch = await call("crm.deal.list", {
    filter: { ">=DATE_CREATE": dateFrom },
    select: [
      "ID",
      "STAGE_ID",
      "STAGE_SEMANTIC_ID",
      "CATEGORY_ID",
      "SOURCE_ID",
      "LOSS_REASON_ID",
    ],
    order: { ID: "DESC" },
    start: 0,
  });
  const deals = batch.result ?? [];
  console.log(`  Получено сделок (первые 50): ${deals.length}`);
  const withLossReason = deals.filter((d) => d.LOSS_REASON_ID && String(d.LOSS_REASON_ID).trim());
  const fSemantic = deals.filter((d) => d.STAGE_SEMANTIC_ID === "F");
  console.log(`  С заполненным LOSS_REASON_ID: ${withLossReason.length}`);
  console.log(`  С STAGE_SEMANTIC_ID=F (проигранные): ${fSemantic.length}`);
  if (withLossReason.length > 0) {
    console.log("\n  Примеры LOSS_REASON_ID:");
    const uniq = [...new Set(withLossReason.map((d) => d.LOSS_REASON_ID))].slice(0, 10);
    uniq.forEach((v) => console.log(`    "${v}"`));
  }
  if (fSemantic.length > 0) {
    console.log("\n  Распределение проигранных по STAGE_ID:");
    const grp = {};
    for (const d of fSemantic) grp[d.STAGE_ID] = (grp[d.STAGE_ID] || 0) + 1;
    Object.entries(grp)
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`    ${k}: ${v}`));
  }

  // 6. Источники — проверяем что реально в SOURCE_ID
  section("6) SOURCE_ID в последних сделках");
  const srcGrp = {};
  for (const d of deals) {
    const k = d.SOURCE_ID || "(пусто)";
    srcGrp[k] = (srcGrp[k] || 0) + 1;
  }
  Object.entries(srcGrp)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k.padEnd(25)} ${v}`));

  // 7. Справочник SOURCE
  section("7) Справочник SOURCE (crm.status.list ENTITY_ID=SOURCE)");
  try {
    const src = await call("crm.status.list", {
      filter: { ENTITY_ID: "SOURCE" },
      order: { SORT: "ASC" },
    });
    for (const s of src.result ?? []) {
      console.log(`  STATUS_ID=${s.STATUS_ID.padEnd(25)} NAME=${s.NAME}`);
    }
  } catch (e) {
    console.log("  ERR:", e.message);
  }

  // 8. Справочник DEAL_LOSS_REASON (если вдруг есть)
  section("8) Справочник DEAL_LOSS_REASON (если есть)");
  try {
    const lr = await call("crm.status.list", {
      filter: { ENTITY_ID: "DEAL_LOSS_REASON" },
    });
    const items = lr.result ?? [];
    if (items.length === 0) {
      console.log("  Справочник пуст или не существует");
    } else {
      for (const s of items) {
        console.log(`  STATUS_ID=${s.STATUS_ID.padEnd(25)} NAME=${s.NAME}`);
      }
    }
  } catch (e) {
    console.log("  ERR:", e.message);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
