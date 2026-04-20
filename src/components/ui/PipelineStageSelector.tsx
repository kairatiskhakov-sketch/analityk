"use client";

import { useMemo, useState } from "react";

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

const TYPE_META: Record<string, { label: string; bg: string; color: string; border: string; order: number }> = {
  won:      { label: "Продажа",  bg: "rgba(34, 211, 160, 0.12)", color: "#22D3A0", border: "rgba(34, 211, 160, 0.35)", order: 1 },
  progress: { label: "В работе", bg: "rgba(245, 166, 35, 0.12)",  color: "#F5A623", border: "rgba(245, 166, 35, 0.35)",  order: 2 },
  lost:     { label: "Провал",   bg: "rgba(242, 92, 110, 0.12)",  color: "#F25C6E", border: "rgba(242, 92, 110, 0.35)",  order: 3 },
  ignore:   { label: "Игнор",   bg: "rgba(136, 136, 136, 0.12)", color: "#888888", border: "rgba(136, 136, 136, 0.3)",  order: 4 },
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
  onStageIdsChange,
  stageLabel = "Этапы продажи",
}: Props) {
  const [open, setOpen] = useState(false);

  const visibleStages = useMemo(() => {
    const scope = selectedPipelineId
      ? pipelines.filter((p) => p.id === selectedPipelineId)
      : pipelines;
    return scope
      .flatMap((p) =>
        p.stages.map((s) => ({ ...s, pipelineName: p.name })),
      )
      .sort((a, b) => {
        const td = typeMeta(a.type).order - typeMeta(b.type).order;
        return td !== 0 ? td : (a.sort ?? 0) - (b.sort ?? 0);
      });
  }, [pipelines, selectedPipelineId]);

  // Группируем по типу
  const groups = useMemo(() => {
    const map = new Map<string, typeof visibleStages>();
    for (const s of visibleStages) {
      const t = s.type ?? "progress";
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(s);
    }
    return Array.from(map.entries()).sort(
      ([a], [b]) => typeMeta(a).order - typeMeta(b).order,
    );
  }, [visibleStages]);

  const wonStageIds = useMemo(
    () => visibleStages.filter((s) => s.type === "won").map((s) => s.externalId),
    [visibleStages],
  );

  const selectedCount = selectedStageIds.length;

  function toggle(id: string) {
    onStageIdsChange(
      selectedStageIds.includes(id)
        ? selectedStageIds.filter((x) => x !== id)
        : [...selectedStageIds, id],
    );
  }

  function selectAllWon() {
    onStageIdsChange(wonStageIds);
  }

  function clearAll() {
    onStageIdsChange([]);
  }

  if (visibleStages.length === 0) return null;

  return (
    <div
      className="glass rounded-[18px] border overflow-hidden"
      style={{ borderColor: "var(--border)" }}
    >
      {/* Шапка — всегда видна, кликабельна */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-3">
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: "var(--hint)" }}
          >
            {stageLabel}
          </span>
          {/* Бейдж с количеством */}
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{
              background: selectedCount > 0 ? "rgba(123, 92, 245, 0.2)" : "var(--surface2)",
              color: selectedCount > 0 ? "#9B7FF8" : "var(--muted)",
            }}
          >
            {selectedCount > 0 ? `${selectedCount} выбрано` : "не выбрано"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Быстрые действия — видны только когда закрыто */}
          {!open && (
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={selectAllWon}
                className="rounded-[8px] px-2.5 py-1 text-[11px] font-medium transition-colors"
                style={{
                  background: "rgba(34, 211, 160, 0.12)",
                  color: "#22D3A0",
                  border: "1px solid rgba(34, 211, 160, 0.25)",
                }}
              >
                Все продажи
              </button>
              {selectedCount > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-[8px] px-2.5 py-1 text-[11px] font-medium transition-colors"
                  style={{
                    background: "rgba(242, 92, 110, 0.1)",
                    color: "#F25C6E",
                    border: "1px solid rgba(242, 92, 110, 0.2)",
                  }}
                >
                  Сбросить
                </button>
              )}
            </div>
          )}
          {/* Стрелка */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            style={{
              color: "var(--muted)",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
              flexShrink: 0,
            }}
          >
            <path d="M2.5 5L7 9.5L11.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {/* Раскрытое содержимое */}
      {open && (
        <div
          className="border-t px-4 pb-4 pt-3"
          style={{ borderColor: "var(--border)" }}
        >
          {/* Быстрые действия внутри */}
          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={selectAllWon}
              className="rounded-[8px] px-3 py-1.5 text-[11px] font-semibold transition-colors"
              style={{
                background: "rgba(34, 211, 160, 0.12)",
                color: "#22D3A0",
                border: "1px solid rgba(34, 211, 160, 0.25)",
              }}
            >
              Все продажи
            </button>
            <button
              type="button"
              onClick={() => onStageIdsChange(visibleStages.map((s) => s.externalId))}
              className="rounded-[8px] px-3 py-1.5 text-[11px] font-semibold transition-colors"
              style={{
                background: "var(--surface2)",
                color: "var(--muted)",
                border: "1px solid var(--border)",
              }}
            >
              Выбрать все
            </button>
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="rounded-[8px] px-3 py-1.5 text-[11px] font-semibold transition-colors"
                style={{
                  background: "rgba(242, 92, 110, 0.1)",
                  color: "#F25C6E",
                  border: "1px solid rgba(242, 92, 110, 0.2)",
                }}
              >
                Сбросить
              </button>
            )}
          </div>

          {/* Группы по типу */}
          <div className="space-y-4">
            {groups.map(([type, stages]) => {
              const meta = typeMeta(type);
              const groupIds = stages.map((s) => s.externalId);
              const allSelected = groupIds.every((id) => selectedStageIds.includes(id));

              return (
                <div key={type}>
                  {/* Заголовок группы */}
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="rounded-[6px] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                      style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
                    >
                      {meta.label}
                    </span>
                    <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                      {stages.filter((s) => selectedStageIds.includes(s.externalId)).length}/{stages.length}
                    </span>
                    {/* Выбрать/снять группу */}
                    <button
                      type="button"
                      onClick={() => {
                        if (allSelected) {
                          onStageIdsChange(selectedStageIds.filter((id) => !groupIds.includes(id)));
                        } else {
                          const merged = new Set([...selectedStageIds, ...groupIds]);
                          onStageIdsChange(Array.from(merged));
                        }
                      }}
                      className="text-[10px] underline underline-offset-2 transition-opacity hover:opacity-70"
                      style={{ color: "var(--muted)" }}
                    >
                      {allSelected ? "снять" : "выбрать все"}
                    </button>
                  </div>

                  {/* Чипы этапов */}
                  <div className="flex flex-wrap gap-1.5">
                    {stages.map((stage) => {
                      const active = selectedStageIds.includes(stage.externalId);
                      return (
                        <button
                          key={stage.externalId}
                          type="button"
                          onClick={() => toggle(stage.externalId)}
                          className="rounded-[8px] px-2.5 py-1 text-[12px] font-medium transition-all"
                          style={{
                            background: active ? meta.bg : "var(--surface2)",
                            color: active ? meta.color : "var(--muted)",
                            border: `1px solid ${active ? meta.border : "var(--border)"}`,
                            boxShadow: active ? `0 0 0 1px ${meta.border}` : "none",
                          }}
                        >
                          {stage.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
