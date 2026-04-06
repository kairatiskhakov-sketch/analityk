import { getLeadMetrics } from "@/lib/dashboard/stats";

const empty: Awaited<ReturnType<typeof getLeadMetrics>> = {
  total: 0,
  won: 0,
  lost: 0,
  inProgress: 0,
  salesAmount: 0,
};

export async function getLeadMetricsSafe(
  ...args: Parameters<typeof getLeadMetrics>
): Promise<{
  metrics: Awaited<ReturnType<typeof getLeadMetrics>>;
  dbError: string | null;
}> {
  try {
    const metrics = await getLeadMetrics(...args);
    return { metrics, dbError: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { metrics: empty, dbError: msg };
  }
}
