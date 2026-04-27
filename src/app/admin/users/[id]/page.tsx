import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { UserDetail } from "./user-detail";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      isPlatformAdmin: true,
      createdAt: true,
      updatedAt: true,
      lastLoginAt: true,
      approvedAt: true,
      approvedById: true,
      blockedAt: true,
      blockedById: true,
      blockReason: true,
      currentOrgId: true,
      orgMemberships: {
        select: {
          id: true,
          role: true,
          createdAt: true,
          org: { select: { id: true, name: true, slug: true, plan: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!user) notFound();

  const actorIds = [user.approvedById, user.blockedById].filter(
    (v): v is string => Boolean(v),
  );
  const actors =
    actorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
  const actorMap = new Map(actors.map((a) => [a.id, a]));

  const audits = await prisma.platformAudit.findMany({
    where: { targetId: params.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const auditActorIds = audits
    .map((a) => a.actorId)
    .filter((v): v is string => Boolean(v));
  const auditActors =
    auditActorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: auditActorIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
  const auditActorMap = new Map(auditActors.map((a) => [a.id, a]));

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin/users"
          className="text-[12px]"
          style={{ color: "var(--muted)" }}
        >
          ← К списку пользователей
        </Link>
      </div>

      <UserDetail
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          isPlatformAdmin: user.isPlatformAdmin,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
          lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
          approvedAt: user.approvedAt ? user.approvedAt.toISOString() : null,
          approvedBy: user.approvedById
            ? actorMap.get(user.approvedById) ?? null
            : null,
          blockedAt: user.blockedAt ? user.blockedAt.toISOString() : null,
          blockedBy: user.blockedById
            ? actorMap.get(user.blockedById) ?? null
            : null,
          blockReason: user.blockReason,
          orgs: user.orgMemberships.map((m) => ({
            membershipId: m.id,
            role: m.role,
            joinedAt: m.createdAt.toISOString(),
            org: m.org,
          })),
        }}
        audits={audits.map((a) => ({
          id: a.id,
          action: a.action,
          createdAt: a.createdAt.toISOString(),
          details: a.details as Record<string, unknown> | null,
          actor: a.actorId ? auditActorMap.get(a.actorId) ?? null : null,
        }))}
      />
    </div>
  );
}
