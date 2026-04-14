import { prisma } from "@/lib/prisma";

/** Любое активное подключение CRM (Bitrix / Amo и т.д.) */
export async function getFirstActiveCrmConnection() {
  return prisma.crmConnection.findFirst({ where: { isActive: true } });
}
