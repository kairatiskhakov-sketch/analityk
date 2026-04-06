import { jsonError, jsonOk } from "@/lib/http/json";
import { parseDashboardPeriod } from "@/lib/dashboard/range";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period");
    const { start, end } = parseDashboardPeriod(period);

    const won = await prisma.lead.findMany({
      where: {
        status: "won",
        closedAt: { gte: start, lte: end },
        managerId: { not: null },
      },
      include: { manager: true },
    });

    const map = new Map<
      string,
      { name: string; deals: number; amount: number }
    >();
    for (const l of won) {
      if (!l.manager) continue;
      const cur = map.get(l.manager.id) ?? {
        name: l.manager.name,
        deals: 0,
        amount: 0,
      };
      cur.deals += 1;
      cur.amount += l.amount;
      map.set(l.manager.id, cur);
    }

    const ranking = Array.from(map.values()).sort((a, b) => b.amount - a.amount);

    return jsonOk({ ranking });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
