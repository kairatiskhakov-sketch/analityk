import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SOURCES = [
  "google",
  "instagram",
  "таргет",
  "органика",
  "контекст",
  "рекомендация",
  "холодный обзвон",
];

const STATUSES = ["new", "in_progress", "won", "lost"] as const;

function randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomBetween(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

async function main() {
  const connection = await prisma.crmConnection.create({
    data: {
      crmType: "bitrix24",
      isActive: true,
      lastSyncAt: new Date(),
      bitrixDomain: "demo.bitrix24.ru",
    },
  });

  const managers = await Promise.all(
    [
      { externalId: "bx_m1", name: "Алия Нурланова", email: "aliya@example.com" },
      { externalId: "bx_m2", name: "Данияр Сейткалиев", email: "daniyar@example.com" },
      { externalId: "bx_m3", name: "Карина Мухамедова", email: "karina@example.com" },
      { externalId: "bx_m4", name: "Нурлан Бекжанов", email: "nurlan@example.com" },
    ].map((m) =>
      prisma.manager.create({
        data: {
          ...m,
          crmType: "bitrix24",
        },
      }),
    ),
  );

  const managerIds = managers.map((m) => m.id);

  const firstNames = [
    "Айгерим",
    "Тимур",
    "Асель",
    "Ерлан",
    "Мадина",
    "Арман",
    "Сабина",
    "Рустем",
  ];
  const lastInitials = ["С.", "Р.", "К.", "Б.", "Т.", "Н.", "М.", "Л."];

  const leadsData = Array.from({ length: 50 }, (_, i) => {
    const status = randomItem(STATUSES);
    const created = new Date();
    created.setDate(created.getDate() - randomBetween(0, 90));
    const closed =
      status === "won" || status === "lost"
        ? new Date(created.getTime() + randomBetween(1, 14) * 86400000)
        : null;

    const source = randomItem(SOURCES);
    const utmGoogle = source === "google" || source === "контекст";

    return {
      externalId: `seed_lead_${i + 1}`,
      crmType: "bitrix24" as const,
      connectionId: connection.id,
      name: `${randomItem(firstNames)} ${randomItem(lastInitials)}`,
      phone: `+7 7${randomBetween(100, 999)} ${randomBetween(100, 999)} ${randomBetween(10, 99)} ${randomBetween(10, 99)}`,
      email: `lead${i + 1}@example.com`,
      source,
      utmSource: utmGoogle ? "google" : source === "instagram" ? "instagram" : null,
      utmMedium: utmGoogle ? randomItem(["cpc", "organic"]) : null,
      utmCampaign: utmGoogle ? `camp_${randomBetween(1, 5)}` : null,
      managerId: randomItem(managerIds),
      status,
      amount: randomBetween(20, 500) * 1000,
      failReason:
        status === "lost"
          ? randomItem(["Дорого", "Не по бюджету", "Ушёл к конкуренту", "Не дозвонились"])
          : null,
      createdAt: created,
      closedAt: closed,
    };
  });

  await prisma.lead.createMany({ data: leadsData });

  await prisma.syncLog.create({
    data: {
      connectionId: connection.id,
      crmType: "bitrix24",
      leadsCount: 50,
      dealsCount: 0,
      startedAt: new Date(),
      finishedAt: new Date(),
    },
  });

  console.log("Seed OK: 1 CrmConnection, 4 Manager, 50 Lead, 1 SyncLog");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
