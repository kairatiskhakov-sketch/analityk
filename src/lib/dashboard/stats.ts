import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export function leadWhere(
  start: Date,
  end: Date,
  connectionId?: string | null,
): Prisma.LeadWhereInput {
  const base: Prisma.LeadWhereInput = {
    createdAt: { gte: start, lte: end },
  };
  if (connectionId) {
    base.connectionId = connectionId;
  }
  return base;
}

export async function getLeadMetrics(
  start: Date,
  end: Date,
  connectionId?: string | null,
) {
  const where = leadWhere(start, end, connectionId);
  const leads = await prisma.lead.findMany({ where });
  const won = leads.filter((l) => l.status === "won");
  const lost = leads.filter((l) => l.status === "lost");
  const sales = won.reduce((s, l) => s + l.amount, 0);
  return {
    total: leads.length,
    won: won.length,
    lost: lost.length,
    inProgress: leads.filter(
      (l) => l.status === "in_progress" || l.status === "new",
    ).length,
    salesAmount: sales,
  };
}

export async function leadsBySource(
  start: Date,
  end: Date,
  connectionId?: string | null,
) {
  const where = leadWhere(start, end, connectionId);
  const leads = await prisma.lead.findMany({ where, select: { source: true } });
  const map = new Map<string, number>();
  for (const l of leads) {
    map.set(l.source, (map.get(l.source) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([source, count]) => ({ source, count }));
}

export async function funnelCounts(
  start: Date,
  end: Date,
  connectionId?: string | null,
) {
  const where = leadWhere(start, end, connectionId);
  const leads = await prisma.lead.findMany({ where });
  return {
    new: leads.filter((l) => l.status === "new").length,
    in_progress: leads.filter((l) => l.status === "in_progress").length,
    won: leads.filter((l) => l.status === "won").length,
    lost: leads.filter((l) => l.status === "lost").length,
  };
}

export async function leadsByDay(
  start: Date,
  end: Date,
  connectionId?: string | null,
) {
  const where = leadWhere(start, end, connectionId);
  const leads = await prisma.lead.findMany({
    where,
    select: { createdAt: true },
  });
  const byDay = new Map<string, number>();
  for (const l of leads) {
    const k = l.createdAt.toISOString().slice(0, 10);
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  return Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));
}

export async function topFailReasons(
  start: Date,
  end: Date,
  connectionId?: string | null,
  take = 10,
) {
  const where: Prisma.LeadWhereInput = {
    ...leadWhere(start, end, connectionId),
    status: "lost",
    failReason: { not: null },
  };
  const leads = await prisma.lead.findMany({
    where,
    select: { failReason: true },
  });
  const map = new Map<string, number>();
  for (const l of leads) {
    const r = l.failReason ?? "";
    if (!r) continue;
    map.set(r, (map.get(r) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, take);
}
