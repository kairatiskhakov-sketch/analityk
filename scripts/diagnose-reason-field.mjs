#!/usr/bin/env node
const WEBHOOK = "https://higroup.bitrix24.kz/rest/5701/duu385n5a5j62oai/";
const FIELD = "UF_CRM_1679040517519";

async function call(method, params = {}) {
  const res = await fetch(WEBHOOK + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return res.json();
}

async function main() {
  // Словарь поля
  const meta = await call("crm.deal.userfield.list");
  const field = (meta.result ?? []).find((f) => f.FIELD_NAME === FIELD);
  const dict = new Map();
  for (const item of field?.LIST ?? []) dict.set(String(item.ID), item.VALUE);
  console.log(`Словарь поля (${dict.size} значений):`);
  for (const [k, v] of dict) console.log(`  ${k} → ${v}`);

  // Все проигранные сделки за 90 дней, с пагинацией
  const dateFrom = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const all = [];
  let start = 0;
  while (true) {
    const res = await call("crm.deal.list", {
      filter: { ">=CLOSEDATE": dateFrom, STAGE_SEMANTIC_ID: "F" },
      select: ["ID", "STAGE_ID", "CATEGORY_ID", "CLOSEDATE", FIELD],
      order: { ID: "DESC" },
      start,
    });
    const batch = res.result ?? [];
    all.push(...batch);
    if (res.next !== undefined) start = res.next;
    else break;
    if (all.length > 5000) break;
  }
  console.log(`\nПроигранных сделок за 90 дней: ${all.length}`);
  const filled = all.filter((d) => d[FIELD] && String(d[FIELD]).trim() && String(d[FIELD]) !== "0");
  console.log(`С заполненным ${FIELD}: ${filled.length} (${Math.round((filled.length / (all.length || 1)) * 100)}%)`);

  const grp = new Map();
  for (const d of filled) {
    const label = dict.get(String(d[FIELD])) ?? `ID=${d[FIELD]}`;
    grp.set(label, (grp.get(label) ?? 0) + 1);
  }
  console.log("\nРаспределение причин отказа:");
  [...grp.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`));

  // По воронкам
  console.log("\nПо воронкам:");
  const byCat = new Map();
  for (const d of all) {
    const c = d.CATEGORY_ID ?? "0";
    const bucket = byCat.get(c) ?? { total: 0, filled: 0 };
    bucket.total += 1;
    if (d[FIELD] && String(d[FIELD]) !== "0") bucket.filled += 1;
    byCat.set(c, bucket);
  }
  for (const [c, b] of byCat)
    console.log(`  CATEGORY_ID=${c}: ${b.filled}/${b.total} заполнено`);
}

main().catch(console.error);
