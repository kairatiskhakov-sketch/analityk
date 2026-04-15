#!/usr/bin/env node
const WEBHOOK = "https://higroup.bitrix24.kz/rest/5701/duu385n5a5j62oai/";

async function call(m, p = {}) {
  const r = await fetch(WEBHOOK + m, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  return r.json();
}

async function listAll(method, params) {
  const out = [];
  let start = 0;
  while (true) {
    const r = await call(method, { ...params, start });
    out.push(...(r.result ?? []));
    if (r.next !== undefined) start = r.next;
    else break;
    if (out.length > 20000) break;
  }
  return out;
}

async function main() {
  const days = Number(process.argv[2] ?? 30);
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);

  const srcList = await call("crm.status.list", { filter: { ENTITY_ID: "SOURCE" } });
  const srcMap = new Map();
  for (const s of srcList.result ?? []) srcMap.set(String(s.STATUS_ID), s.NAME);

  const lostList = await call("crm.status.list", { filter: { ENTITY_ID: "LEAD_LOST_REASON" } });
  const lostMap = new Map();
  for (const s of lostList.result ?? []) lostMap.set(String(s.STATUS_ID), s.NAME);
  console.log(`LEAD_LOST_REASON словарь: ${lostMap.size} значений`);

  const leads = await listAll("crm.lead.list", {
    filter: {
      ">=DATE_CREATE": `${from}T00:00:00`,
      "<=DATE_CREATE": `${to}T23:59:59`,
    },
    select: ["ID", "SOURCE_ID", "STATUS_SEMANTIC_ID", "STATUS_ID", "LOST_REASON_ID"],
  });
  console.log(`\nЛидов за ${days}д: ${leads.length}`);

  // Источники лидов
  const srcCnt = new Map();
  let noSource = 0;
  for (const l of leads) {
    const raw = String(l.SOURCE_ID ?? "");
    if (!raw) {
      noSource++;
      continue;
    }
    const name = srcMap.get(raw) ?? raw;
    srcCnt.set(name, (srcCnt.get(name) ?? 0) + 1);
  }
  console.log(`\nЛиды без SOURCE_ID: ${noSource} (из ${leads.length})`);
  console.log("Источники лидов (с заполненным SOURCE_ID):");
  [...srcCnt.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([k, v]) => console.log(`  ${String(v).padStart(5)}  ${k}`));

  // Причины провалов у лидов
  const fLeads = leads.filter((l) => String(l.STATUS_SEMANTIC_ID ?? "").toUpperCase() === "F" || String(l.STATUS_ID ?? "").toUpperCase().includes("JUNK"));
  console.log(`\nПроигранных лидов: ${fLeads.length}`);
  const lrCnt = new Map();
  for (const l of fLeads) {
    const raw = String(l.LOST_REASON_ID ?? "");
    const key = raw || "(пусто)";
    lrCnt.set(key, (lrCnt.get(key) ?? 0) + 1);
  }
  console.log("LOST_REASON_ID распределение:");
  [...lrCnt.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([k, v]) => {
      const label = k === "(пусто)" ? "(пусто)" : (lostMap.get(k) ?? `id=${k}`);
      console.log(`  ${String(v).padStart(5)}  ${label}`);
    });
}

main().catch(console.error);
