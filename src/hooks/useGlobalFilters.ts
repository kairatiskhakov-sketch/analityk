"use client";

import { useRouter, useSearchParams } from "next/navigation";

export type GlobalFilterPreset = "today" | "7d" | "30d" | "90d" | "year" | "custom";

export type GlobalFiltersState = {
  dateFrom: string;
  dateTo: string;
  preset: GlobalFilterPreset;
  managerIds: string[];
  pipelineId: string;
  stageIds: string[];
};

function normalizePreset(raw: string | null): GlobalFilterPreset {
  if (!raw) return "7d";
  if (raw === "today" || raw === "7d" || raw === "30d" || raw === "90d" || raw === "year" || raw === "custom") {
    return raw;
  }
  if (raw === "week") return "7d";
  if (raw === "month") return "30d";
  if (raw === "quarter") return "90d";
  return "7d";
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultFrom(preset: GlobalFilterPreset): string {
  const now = new Date();
  const start = new Date(now);
  if (preset === "today") return toYmd(now);
  if (preset === "7d") start.setDate(start.getDate() - 7);
  else if (preset === "30d") start.setDate(start.getDate() - 30);
  else if (preset === "90d") start.setDate(start.getDate() - 90);
  else if (preset === "year") start.setDate(start.getDate() - 365);
  else start.setDate(start.getDate() - 7);
  return toYmd(start);
}

export function useGlobalFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const preset: GlobalFilterPreset = normalizePreset(searchParams.get("preset"));
  const dateTo = searchParams.get("dateTo") || toYmd(new Date());
  const dateFrom = searchParams.get("dateFrom") || defaultFrom(preset);
  const managerIds = (searchParams.get("managers") || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const pipelineId = searchParams.get("pipelineId") || "";
  const stageIds = (searchParams.get("stageIds") || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const apply = (filters: Partial<GlobalFiltersState>) => {
    const params = new URLSearchParams(searchParams.toString());
    const df = filters.dateFrom ?? dateFrom;
    const dt = filters.dateTo ?? dateTo;
    const pr = filters.preset ?? preset;
    const mids = filters.managerIds ?? managerIds;
    const pid = filters.pipelineId ?? pipelineId;
    const sids = filters.stageIds ?? stageIds;

    params.set("dateFrom", df);
    params.set("dateTo", dt);
    params.set("preset", pr);
    if (mids.length) {
      const packed = mids.join(",");
      params.set("managers", packed);
    } else {
      params.delete("managers");
    }
    if (pid) params.set("pipelineId", pid);
    else params.delete("pipelineId");
    if (sids.length) params.set("stageIds", sids.join(","));
    else params.delete("stageIds");

    router.push(`?${params.toString()}`);
  };

  return { dateFrom, dateTo, preset, managerIds, pipelineId, stageIds, apply };
}
