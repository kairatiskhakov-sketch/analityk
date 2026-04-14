import { getFirstActiveCrmConnection } from "@/lib/crm/active-connection";
import { EMPTY_LEAD_METRICS } from "@/lib/dashboard/no-crm-empty";
import { getLeadMetrics } from "@/lib/dashboard/stats";

const empty: Awaited<ReturnType<typeof getLeadMetrics>> = {
  ...EMPTY_LEAD_METRICS,
};

export async function getLeadMetricsSafe(
  ...args: Parameters<typeof getLeadMetrics>
): Promise<{
  metrics: Awaited<ReturnType<typeof getLeadMetrics>>;
  dbError: string | null;
}> {
  try {
    const active = await getFirstActiveCrmConnection();
    if (!active) {
      return { metrics: empty, dbError: null };
    }
    const metrics = await getLeadMetrics(...args);
    return { metrics, dbError: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { metrics: empty, dbError: msg };
  }
}
