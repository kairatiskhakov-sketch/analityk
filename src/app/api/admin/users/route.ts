import type { Prisma, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonOk } from "@/lib/http/json";
import { requirePlatformAdmin } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

const VALID_STATUS: UserStatus[] = ["PENDING", "ACTIVE", "BLOCKED"];

function parseStatus(v: string | null): UserStatus | null {
  if (!v) return null;
  const up = v.toUpperCase() as UserStatus;
  return (VALID_STATUS as string[]).includes(up) ? up : null;
}

export async function GET(req: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const status = parseStatus(url.searchParams.get("status"));
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200);
  const page = Math.max(Number.isFinite(pageRaw) ? pageRaw : 1, 1);
  const skip = (page - 1) * limit;

  const where: Prisma.UserWhereInput = {};
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        isPlatformAdmin: true,
        createdAt: true,
        lastLoginAt: true,
        approvedAt: true,
        blockedAt: true,
        blockReason: true,
        _count: { select: { orgMemberships: true } },
      },
    }),
  ]);

  return jsonOk({
    items: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      status: u.status,
      isPlatformAdmin: u.isPlatformAdmin,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      approvedAt: u.approvedAt ? u.approvedAt.toISOString() : null,
      blockedAt: u.blockedAt ? u.blockedAt.toISOString() : null,
      blockReason: u.blockReason,
      orgCount: u._count.orgMemberships,
    })),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
}
