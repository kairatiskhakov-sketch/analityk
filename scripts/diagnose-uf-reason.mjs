#!/usr/bin/env node
const WEBHOOK = "https://higroup.bitrix24.kz/rest/5701/duu385n5a5j62oai/";

async function call(method, params = {}) {
  const url = WEBHOOK + method;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return res.json();
}

async function main() {
  // Метаданные UF-поля
  const meta = await call("crm.deal.userfield.list");
  const reason = (meta.result ?? []).find((f) => f.FIELD_NAME === "UF_CRM_IMP_L_REASON");
  console.log("Поле UF_CRM_IMP_L_REASON:");
  console.log("  type:", reason?.USER_TYPE_ID);
  console.log("  mandatory:", reason?.MANDATORY);
  console.log("  list:", JSON.stringify(reason?.LIST, null, 2));

  // Последние 50 сделок с этим полем
  const dateFrom = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const deals = await call("crm.deal.list", {
    filter: { ">=DATE_CREATE": dateFrom },
    select: [
      "ID",
      "STAGE_ID",
      "STAGE_SEMANTIC_ID",
      "CATEGORY_ID",
      "UF_CRM_IMP_L_REASON",
    ],
    order: { ID: "DESC" },
  });

  const list = deals.result ?? [];
  const filled = list.filter((d) => d.UF_CRM_IMP_L_REASON && String(d.UF_CRM_IMP_L_REASON).trim());
  console.log(`\nИз ${list.length} сделок UF_CRM_IMP_L_REASON заполнен у ${filled.length}`);
  const f = list.filter((d) => d.STAGE_SEMANTIC_ID === "F");
  const fFilled = f.filter((d) => d.UF_CRM_IMP_L_REASON);
  console.log(`Из ${f.length} ПРОИГРАННЫХ: UF_CRM_IMP_L_REASON заполнен у ${fFilled.length}`);
  if (fFilled.length > 0) {
    const grp = {};
    for (const d of fFilled) grp[d.UF_CRM_IMP_L_REASON] = (grp[d.UF_CRM_IMP_L_REASON] || 0) + 1;
    console.log("\nРаспределение:");
    for (const [k, v] of Object.entries(grp)) console.log(`  ${k}: ${v}`);
  }

  // Для широкой картины — за 90 дней
  const dateFrom90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const deals90 = await call("crm.deal.list", {
    filter: { ">=DATE_CREATE": dateFrom90, STAGE_SEMANTIC_ID: "F" },
    select: ["ID", "STAGE_ID", "CATEGORY_ID", "UF_CRM_IMP_L_REASON"],
    order: { ID: "DESC" },
    start: 0,
  });
  const f90 = deals90.result ?? [];
  console.log(`\n\nПроигранные за 90 дней (первая страница 50): ${f90.length}`);
  const grp90 = {};
  for (const d of f90) {
    const k = d.STAGE_ID;
    grp90[k] = (grp90[k] || 0) + 1;
  }
  console.log("Распределение по STAGE_ID:");
  Object.entries(grp90)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v}`));
}

main().catch(console.error);
