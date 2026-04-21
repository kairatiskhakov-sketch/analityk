import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
try {
  const r = await p.$queryRawUnsafe(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('DashboardModule','Organization','OrgMember','AdConnection')
  `);
  console.log("Existing tables:", r);
  const applied = await p.$queryRawUnsafe(`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at`);
  console.log("All applied migrations:");
  for (const m of applied) console.log(" -", m.migration_name, m.finished_at ? "OK" : "PENDING");
} catch (e) {
  console.error("Error:", e.message);
} finally {
  await p.$disconnect();
}
