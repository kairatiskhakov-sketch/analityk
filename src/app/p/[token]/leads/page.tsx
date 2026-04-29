import { LeadsPageClient } from "@/app/dashboard/leads/LeadsPageClient";
import { PageTopBar } from "@/components/ui";
import { formatDateRangeSubtitle } from "@/lib/dashboard/range";
import { ensureDateRange, requireShareSection } from "../_helpers";

export const dynamic = "force-dynamic";

export default async function PublicLeadsPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireShareSection(params.token, "leads");
  const { dateFrom, dateTo, preset } = ensureDateRange({
    pathname: `/p/${params.token}/leads`,
    searchParams,
    defaultPreset: "week",
  });
  const rangeLabel = formatDateRangeSubtitle(
    new Date(`${dateFrom}T00:00:00Z`),
    new Date(`${dateTo}T00:00:00Z`),
    preset,
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageTopBar
        title="Аналитика лидов"
        sub={`${rangeLabel} · лиды, динамика, воронка, качество обработки`}
      />
      <LeadsPageClient />
    </div>
  );
}
