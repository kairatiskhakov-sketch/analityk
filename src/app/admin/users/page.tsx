import { prisma } from "@/lib/prisma";
import { UsersPanel } from "./users-panel";

export const dynamic = "force-dynamic";

type Search = {
  status?: string;
  q?: string;
  page?: string;
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  // Counts по статусам — для табов
  const [pending, active, blocked] = await Promise.all([
    prisma.user.count({ where: { status: "PENDING" } }),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { status: "BLOCKED" } }),
  ]);

  return (
    <UsersPanel
      counts={{ PENDING: pending, ACTIVE: active, BLOCKED: blocked }}
      initialStatus={(searchParams.status ?? "PENDING").toUpperCase()}
      initialQuery={searchParams.q ?? ""}
      initialPage={Number(searchParams.page ?? "1") || 1}
    />
  );
}
