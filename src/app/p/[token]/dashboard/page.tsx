import { DashboardClient } from "@/app/dashboard/DashboardClient";
import { formatDateRangeSubtitle } from "@/lib/dashboard/range";
import { ensureDateRange, requireShareSection } from "../_helpers";

export const dynamic = "force-dynamic";

export default async function PublicDashboardPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireShareSection(params.token, "dashboard");
  const { dateFrom, dateTo, preset } = ensureDateRange({
    pathname: `/p/${params.token}/dashboard`,
    searchParams,
    defaultPreset: "week",
  });
  const rangeLabel = formatDateRangeSubtitle(
    new Date(`${dateFrom}T00:00:00Z`),
    new Date(`${dateTo}T00:00:00Z`),
    preset,
  );

  return (
    <DashboardClient
      dateFrom={dateFrom}
      dateTo={dateTo}
      preset={preset}
      rangeLabel={rangeLabel}
    />
  );
}
