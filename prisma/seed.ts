import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function seedAdmin() {
  const email = "admin@saldo.kz";
  const password = await bcrypt.hash("admin123", 12);
  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "Азамат М.",
      password,
      role: Role.ADMIN,
      initials: "АМ",
    },
    update: {
      password,
      role: Role.ADMIN,
      name: "Азамат М.",
      initials: "АМ",
    },
  });
  console.log("Seed: admin user", email);
}

async function seedDemoCrm() {
  const existing = await prisma.crmConnection.count();
  if (existing > 0) {
    console.log("Seed: demo CRM skipped (already present)");
    return;
  }

  const { DEFAULT_ORG_ID } = await import("../src/lib/org/context");

  await prisma.crmConnection.create({
    data: {
      orgId: DEFAULT_ORG_ID,
      crmType: "bitrix24",
      isActive: true,
      lastSyncAt: new Date(),
      bitrixDomain: "demo.bitrix24.ru",
    },
  });

  await Promise.all(
    [
      { externalId: "bx_m1", name: "Алия Нурланова", email: "aliya@example.com" },
      { externalId: "bx_m2", name: "Данияр Сейткалиев", email: "daniyar@example.com" },
      { externalId: "bx_m3", name: "Карина Мухамедова", email: "karina@example.com" },
      { externalId: "bx_m4", name: "Нурлан Бекжанов", email: "nurlan@example.com" },
    ].map((m) =>
      prisma.manager.create({
        data: {
          ...m,
          orgId: DEFAULT_ORG_ID,
          crmType: "bitrix24",
        },
      }),
    ),
  );

  console.log("Seed OK: 1 CrmConnection, 4 Manager (лиды/сделки — только из Bitrix API)");
}

async function main() {
  await seedAdmin();
  await seedDemoCrm();
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
