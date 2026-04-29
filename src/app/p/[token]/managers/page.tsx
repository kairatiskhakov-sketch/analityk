import { ManagersDynamicsClient } from "@/app/dashboard/managers/ManagersDynamicsClient";
import { formatDateRangeSubtitle } from "@/lib/dashboard/range";
import { ensureDateRange, requireShareSection } from "../_helpers";

export const dynamic = "force-dynamic";

export default async function PublicManagersPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireShareSection(params.token, "managers");
  const { dateFrom, dateTo, preset } = ensureDateRange({
    pathname: `/p/${params.token}/managers`,
    searchParams,
    defaultPreset: "week",
    extraParams: { groupBy: "week" },
  });
  const rangeLabel = formatDateRangeSubtitle(
    new Date(`${dateFrom}T00:00:00Z`),
    new Date(`${dateTo}T00:00:00Z`),
    preset,
  );

  return (
    <ManagersDynamicsClient
      dateFrom={dateFrom}
      dateTo={dateTo}
      preset={preset}
      rangeLabel={rangeLabel}
    />
  );
}
