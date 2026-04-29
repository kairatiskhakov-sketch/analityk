import { PlanPageClient } from "@/app/dashboard/plan/PlanPageClient";
import { requireShareSection } from "../_helpers";

export const dynamic = "force-dynamic";

export default async function PublicPlanPage({
  params,
}: {
  params: { token: string };
}) {
  await requireShareSection(params.token, "plan");
  return <PlanPageClient />;
}
