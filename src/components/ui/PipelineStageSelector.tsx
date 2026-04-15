"use client";

import { useMemo } from "react";

export type PipelineStageType = "won" | "lost" | "progress" | "ignore";

export type PipelineStageItem = {
  externalId: string;
  name: string;
  type: PipelineStageType | string;
  sort?: number;
  color?: string | null;
};

export type PipelineStageGroup = {
  id: string;
  name: string;
  stages: PipelineStageItem[];
};

type Props = {
  pipelines: PipelineStageGroup[];
  selectedPipelineId: string;
  selectedStageIds: string[];
  onPipelineChange: (pipelineId: string) => void;
  onStageIdsChange: (stageIds: string[]) => void;
  allowAllPipelines?: boolean;
  pipelineLabel?: string;
  stageLabel?: string;
};

const TYPE_META: Record<string, { label: string; bg: string; color: string; order: number }> = {
  won: { label: "✅ Продажа", bg: "rgba(34, 211, 160, 0.2)", color: "#22D3A0", order: 1 },
  progress: { label: "🔄 В работе", bg: "rgba(245, 166, 35, 0.2)", color: "#F5A623", order: 2 },
  lost: { label: "❌ Провал", bg: "rgba(242, 92, 110, 0.2)", color: "#F25C6E", order: 3 },
  ignore: { label: "⏭ Игнор", bg: "rgba(136, 136, 136, 0.2)", color: "#888888", order: 4 },
};

function typeMeta(type: string) {
  return TYPE_META[type] ?? TYPE_META.progress;
}

export function defaultWonStagesForPipeline(
  pipelines: PipelineStageGroup[],
  pipelineId: string,
): string[] {
  const inScope = pipelineId
    ? pipelines.filter((p) => p.id === pipelineId)
    : pipelines;
  return inScope
    .flatMap((p) => p.stages)
    .filter((s) => s.type === "won")
    .map((s) => s.externalId);
}

export function PipelineStageSelector({
  pipelines,
  selectedPipelineId,
  selectedStageIds,
  onPipelineChange,
  onStageIdsChange,
  allowAllPipelines = false,
  pipelineLabel = "Воронка",
  stageLabel = "Учитывать этапы как продажу",
}: Props) {
  const visiblePipelines = useMemo(() => {
    if (!selectedPipelineId) return pipelines;
    return pipelines.filter((p) => p.id === selectedPipelineId);
  }, [pipelines, selectedPipelineId]);

  const visibleStages = useMemo(
    () =>
      visiblePipelines
        .flatMap((p) =>
          p.stages.map((s) => ({
            ...s,
            pipelineName: p.name,
          })),
        )
        .sort((a, b) => {
          const typeDiff = typeMeta(a.type).order - typeMeta(b.type).order;
          if (typeDiff !== 0) return typeDiff;
          return (a.sort ?? 0) - (b.sort ?? 0);
        }),
    [visiblePipelines],
  );

  return (
    <div className="glass rounded-[18px] border p-4" style={{ borderColor: "var(--border)" }}>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: "var(--hint)" }}>
        {pipelineLabel}
      </label>
      <select
        value={selectedPipelineId}
        onChange={(e) => onPipelineChange(e.target.value)}
        className="w-full rounded-[12px] border px-2 py-2 text-[12px]"
        style={{ borderColor: "var(--border2)", background: "var(--surface)", color: "var(--text)" }}
      >
        {allowAllPipelines ? <option value="">Все воронки</option> : null}
        {pipelines.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <p className="mb-2 mt-4 text-[12px] font-semibold" style={{ color: "var(--text)" }}>
        {stageLabel}:
      </p>

      <div className="grid gap-1">
        {visibleStages.map((stage) => {
          const checked = selectedStageIds.includes(stage.externalId);
          const meta = typeMeta(stage.type);
          return (
            <label key={`${stage.pipelineName}-${stage.externalId}`} className="flex items-center gap-2 text-[13px]" style={{ color: "var(--text)" }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onStageIdsChange(
                    checked
                      ? selectedStageIds.filter((id) => id !== stage.externalId)
                      : [...selectedStageIds, stage.externalId],
                  )
                }
              />
              <span className="inline-flex items-center gap-2">
                <span className="rounded-[6px] px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: meta.bg, color: meta.color }}>
                  {meta.label}
                </span>
                <span>{stage.name}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
