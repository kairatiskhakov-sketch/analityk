import { MarketingClient } from "@/app/dashboard/marketing/MarketingClient";
import { formatDateRangeSubtitle } from "@/lib/dashboard/range";
import { ensureDateRange, requireShareSection } from "../_helpers";

export const dynamic = "force-dynamic";

export default async function PublicMarketingPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireShareSection(params.token, "marketing");
  const { dateFrom, dateTo, preset } = ensureDateRange({
    pathname: `/p/${params.token}/marketing`,
    searchParams,
    defaultPreset: "month",
  });
  const rangeLabel = formatDateRangeSubtitle(
    new Date(`${dateFrom}T00:00:00Z`),
    new Date(`${dateTo}T00:00:00Z`),
    preset,
  );

  return (
    <MarketingClient
      dateFrom={dateFrom}
      dateTo={dateTo}
      rangeLabel={rangeLabel}
    />
  );
}
