#!/usr/bin/env node
// Имитирует логику overview-stats.ts и показывает что должно попасть в дашборд
const WEBHOOK = "https://higroup.bitrix24.kz/rest/5701/duu385n5a5j62oai/";
const LOSS_FIELD = "UF_CRM_1679040517519";

const DEFAULT_SOURCES = {
  CALL: "Звонок",
  EMAIL: "Email",
  WEB: "Веб-сайт",
  ADVERTISING: "Реклама",
  PARTNER: "Партнёр",
  RECOMMENDATION: "Рекомендация",
  TRADE_SHOW: "Выставка",
  SELF: "Собственный",
  OTHER: "Другое",
};

function resolveSourceLabel(rawId, nameById) {
  const id = (rawId ?? "").toString().trim();
  const norm = id.toUpperCase() || "OTHER";
  return (
    nameById.get(id) ??
    nameById.get(norm) ??
    DEFAULT_SOURCES[norm] ??
    (rawId ? String(rawId) : "Другое")
  );
}

async function call(method, params = {}) {
  const res = await fetch(WEBHOOK + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return res.json();
}

async function listAll(method, params) {
  const out = [];
  let start = 0;
  while (true) {
    const r = await call(method, { ...params, start });
    out.push(...(r.result ?? []));
    if (r.next !== undefined) start = r.next;
    else break;
    if (out.length > 10000) break;
  }
  return out;
}

function topSeven(entries) {
  const sorted = [...entries].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, 7);
  const rest = sorted.slice(7).reduce((s, x) => s + x.count, 0);
  if (rest > 0) top.push({ name: "Другое", count: rest });
  return top;
}

async function main() {
  const periodDays = Number(process.argv[2] ?? 30);
  const to = new Date();
  const from = new Date(Date.now() - periodDays * 86400000);
  const dateFrom = from.toISOString().slice(0, 10);
  const dateTo = to.toISOString().slice(0, 10);
  console.log(`Период: ${dateFrom} … ${dateTo} (${periodDays} дн)\n`);

  // Словари
  const srcList = await call("crm.status.list", { filter: { ENTITY_ID: "SOURCE" } });
  const srcMap = new Map();
  for (const s of srcList.result ?? []) srcMap.set(String(s.STATUS_ID), s.NAME);

  const ufList = await call("crm.deal.userfield.list", {});
  const field = (ufList.result ?? []).find((f) => f.FIELD_NAME === LOSS_FIELD);
  const ufDict = new Map();
  for (const i of field?.LIST ?? []) ufDict.set(String(i.ID), i.VALUE);

  // Сделки за период
  const deals = await listAll("crm.deal.list", {
    filter: {
      ">=DATE_CREATE": `${dateFrom}T00:00:00`,
      "<=DATE_CREATE": `${dateTo}T23:59:59`,
    },
    select: [
      "ID",
      "STAGE_ID",
      "STAGE_SEMANTIC_ID",
      "CATEGORY_ID",
      "SOURCE_ID",
      "LOSS_REASON_ID",
      LOSS_FIELD,
    ],
    order: { DATE_CREATE: "DESC" },
  });
  console.log(`Получено сделок: ${deals.length}`);
  const fDeals = deals.filter((d) => d.STAGE_SEMANTIC_ID === "F");
  console.log(`Проигранных (F): ${fDeals.length}\n`);

  // Источники
  // Raw SOURCE_ID распределение
  const rawSrcCnt = new Map();
  for (const d of deals) {
    const k = d.SOURCE_ID ?? "(пусто)";
    rawSrcCnt.set(k, (rawSrcCnt.get(k) ?? 0) + 1);
  }
  console.log("=== RAW SOURCE_ID (top 20) ===");
  [...rawSrcCnt.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([k, v]) => {
      const resolved = resolveSourceLabel(k, srcMap);
      const mark = resolved === "Другое" ? " ← не в справочнике" : "";
      console.log(`  ${String(v).padStart(5)}  "${k}" → ${resolved}${mark}`);
    });
  console.log();

  const srcRaw = new Map();
  for (const d of deals) {
    const label = resolveSourceLabel(d.SOURCE_ID, srcMap);
    srcRaw.set(label, (srcRaw.get(label) ?? 0) + 1);
  }
  console.log("=== ИСТОЧНИКИ (по всем сделкам периода) ===");
  const sources = topSeven([...srcRaw.entries()].map(([name, count]) => ({ name, count })));
  for (const s of sources) console.log(`  ${String(s.count).padStart(4)}  ${s.name}`);
  console.log(`  Сумма: ${sources.reduce((a, b) => a + b.count, 0)}`);

  // Причины отказа
  const failRaw = new Map();
  for (const d of fDeals) {
    const uf = String(d[LOSS_FIELD] ?? "").trim();
    if (uf && uf !== "0") {
      const key = `uf:${uf}`;
      failRaw.set(key, (failRaw.get(key) ?? 0) + 1);
      continue;
    }
    const lr = String(d.LOSS_REASON_ID ?? "").trim();
    const key = lr ? `lr:${lr}` : "unknown";
    failRaw.set(key, (failRaw.get(key) ?? 0) + 1);
  }
  console.log("\n=== ПРИЧИНЫ ОТКАЗА (по F-сделкам) ===");
  const reasons = topSeven(
    [...failRaw.entries()].map(([key, count]) => {
      let name;
      if (key === "unknown") name = "Не указана";
      else if (key.startsWith("uf:")) name = ufDict.get(key.slice(3)) ?? `UF ${key.slice(3)}`;
      else name = `LR ${key.slice(3)}`;
      return { name, count };
    }),
  );
  for (const r of reasons) console.log(`  ${String(r.count).padStart(4)}  ${r.name}`);
  console.log(`  Сумма: ${reasons.reduce((a, b) => a + b.count, 0)}`);
}

main().catch(console.error);
