import { auth } from "@/auth";
import { jsonError, jsonOk } from "@/lib/http/json";
import { MODULES } from "@/lib/modules/config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return jsonError("Unauthorized", 401);
    }

    const rows = await prisma.dashboardModule.findMany({
      where: { userId: session.user.id },
    });
    const map = new Map(rows.map((r) => [r.moduleKey, r]));

    const modules = MODULES.map((m, i) => ({
      moduleKey: m.key,
      name: m.name,
      page: m.page,
      isEnabled: map.get(m.key)?.isEnabled ?? m.default,
      position: map.get(m.key)?.position ?? i,
    }));

    return jsonOk({ modules });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return jsonError("Unauthorized", 401);
    }

    const body = (await req.json()) as {
      moduleKey?: string;
      isEnabled?: boolean;
    };
    const moduleKey = body.moduleKey?.trim();
    if (!moduleKey || typeof body.isEnabled !== "boolean") {
      return jsonError("moduleKey и isEnabled обязательны", 400);
    }
    if (!MODULES.some((m) => m.key === moduleKey)) {
      return jsonError("Неизвестный модуль", 400);
    }

    await prisma.dashboardModule.upsert({
      where: {
        userId_moduleKey: {
          userId: session.user.id,
          moduleKey,
        },
      },
      create: {
        userId: session.user.id,
        moduleKey,
        isEnabled: body.isEnabled,
        position: 0,
      },
      update: { isEnabled: body.isEnabled },
    });

    return jsonOk({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
