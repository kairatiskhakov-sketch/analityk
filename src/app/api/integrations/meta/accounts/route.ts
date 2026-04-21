import { jsonError, jsonOk } from "@/lib/http/json";
import { resolveOrgId } from "@/lib/org/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const orgId = await resolveOrgId();
    const connections = await prisma.adConnection.findMany({
      where: { orgId, platform: "META" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        accountId: true,
        accountName: true,
        status: true,
        lastSyncAt: true,
        lastError: true,
        tokenExpiresAt: true,
        createdAt: true,
      },
    });
    return jsonOk({ connections });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
