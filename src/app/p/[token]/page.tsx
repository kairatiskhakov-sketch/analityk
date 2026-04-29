import { notFound, redirect } from "next/navigation";
import { loadShareContext } from "@/lib/org/public-share";

export const dynamic = "force-dynamic";

export default async function PublicShareIndex({
  params,
}: {
  params: { token: string };
}) {
  const ctx = await loadShareContext(params.token);
  if (!ctx || ctx.sections.length === 0) {
    notFound();
  }
  // Первый разрешённый раздел
  const first = ctx.sections[0];
  const target =
    first === "dashboard"
      ? `/p/${params.token}/dashboard`
      : `/p/${params.token}/${first}`;
  redirect(target);
}
