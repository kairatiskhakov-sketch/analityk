import { parseDashboardRangeFromSearchParams } from "@/lib/dashboard/range";

export type DashboardFilters = {
  start: Date;
  end: Date;
  managerIds: string[] | undefined;
  pipelineId: string | undefined;
};

export function parseManagerIdsFromSearchParams(
  searchParams: URLSearchParams,
): string[] | undefined {
  const raw = searchParams.get("managerIds");
  const ids = raw
    ? raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  return ids.length ? ids : undefined;
}

export function parseDashboardFilters(
  searchParams: URLSearchParams,
): DashboardFilters {
  const { start, end } = parseDashboardRangeFromSearchParams(searchParams);
  const raw = searchParams.get("managerIds");
  const managerIds = raw
    ? raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const pipelineId = searchParams.get("pipelineId")?.trim() || undefined;
  return {
    start,
    end,
    managerIds: managerIds.length ? managerIds : undefined,
    pipelineId,
  };
}
