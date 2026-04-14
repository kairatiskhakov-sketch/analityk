import { useMemo } from "react";
import {
  type Period,
  computeRangeForPreset,
} from "@/lib/dashboard/range";

export function usePeriod(
  selected: Period,
  customFrom: Date | null,
  customTo: Date | null,
): { dateFrom: Date; dateTo: Date } {
  return useMemo(() => {
    const { start, end } = computeRangeForPreset(
      selected,
      customFrom,
      customTo,
      new Date(),
    );
    return { dateFrom: start, dateTo: end };
  }, [selected, customFrom, customTo]);
}

export { computeRangeForPreset, type Period };
