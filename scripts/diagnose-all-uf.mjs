#!/usr/bin/env node
const WEBHOOK = "https://higroup.bitrix24.kz/rest/5701/duu385n5a5j62oai/";

async function call(method, params = {}) {
  const res = await fetch(WEBHOOK + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return res.json();
}

async function main() {
  // Все UF поля сделки со словарями
  const meta = await call("crm.deal.userfield.list");
  const fields = meta.result ?? [];
  console.log(`Всего UF-полей на сделке: ${fields.length}\n`);

  const targetValues = ["Нецелевой запрос", "Дубль, тест", "Дорого"];

  for (const f of fields) {
    const label = f.EDIT_FORM_LABEL?.ru || f.LIST_COLUMN_LABEL?.ru || "";
    const hasList = Array.isArray(f.LIST) && f.LIST.length > 0;
    let matched = false;
    if (hasList) {
      for (const item of f.LIST) {
        for (const tv of targetValues) {
          if (item.VALUE?.includes(tv)) {
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
    }
    const mark = matched ? " ← СОВПАДЕНИЕ" : "";
    console.log(`${f.FIELD_NAME}  type=${f.USER_TYPE_ID}  label="${label}"${mark}`);
    if (matched) {
      console.log("  Список:");
      for (const item of f.LIST) {
        console.log(`    ID=${item.ID}  VALUE="${item.VALUE}"`);
      }
    }
  }

  // Тоже для лидов
  console.log("\n\n=== LEAD UF FIELDS ===");
  const leadMeta = await call("crm.lead.userfield.list");
  const lf = leadMeta.result ?? [];
  console.log(`Всего UF-полей на лиде: ${lf.length}`);
  for (const f of lf) {
    const label = f.EDIT_FORM_LABEL?.ru || f.LIST_COLUMN_LABEL?.ru || "";
    const hasList = Array.isArray(f.LIST) && f.LIST.length > 0;
    let matched = false;
    if (hasList) {
      for (const item of f.LIST) {
        for (const tv of ["Нецелевой запрос", "Дубль, тест", "Дорого"]) {
          if (item.VALUE?.includes(tv)) matched = true;
        }
      }
    }
    const mark = matched ? " ← СОВПАДЕНИЕ" : "";
    console.log(`${f.FIELD_NAME}  type=${f.USER_TYPE_ID}  label="${label}"${mark}`);
    if (matched) {
      for (const item of f.LIST) console.log(`    ID=${item.ID}  VALUE="${item.VALUE}"`);
    }
  }
}

main().catch(console.error);
