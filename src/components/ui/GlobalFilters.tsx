"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { ManagerSelect } from "@/components/ui/ManagerSelect";
import { defaultWonStagesForPipeline, type PipelineStageGroup } from "@/components/ui/PipelineStageSelector";
import { fetcher } from "@/lib/swr/fetcher";
import { useGlobalFilters, type GlobalFilterPreset } from "@/hooks/useGlobalFilters";

type Props = {
  showPeriod?: boolean;
  showStages?: boolean;
};

type ManagerFilterOptions = {
  managers: { id: string; externalId: string; name: string }[];
};

const PRESETS: { id: GlobalFilterPreset; label: string }[] = [
  { id: "today", label: "Сегодня" },
  { id: "7d", label: "7 дней" },
  { id: "30d", label: "30 дней" },
  { id: "custom", label: "Свой период" },
];

export function GlobalFilters({ showPeriod = true, showStages = true }: Props) {
  const { data: managerOptions } = useSWR<ManagerFilterOptions>("/api/filters/options", fetcher);
  const { data: pipelinesData } = useSWR<
    { id: string; name: string; stages: { externalId: string; name: string; type: string; sort: number; color: string }[] }[]
  >("/api/filters/pipelines-with-stages", fetcher);
  const [openStages, setOpenStages] = useState(false);
  const [draftStageIds, setDraftStageIds] = useState<string[]>([]);
  const [localPreset, setLocalPreset] = useState<GlobalFilterPreset>("7d");
  const [localDateFrom, setLocalDateFrom] = useState("");
  const [localDateTo, setLocalDateTo] = useState("");
  const [localPipelineId, setLocalPipelineId] = useState("");
  const {
    dateFrom,
    dateTo,
    preset,
    managerIds,
    pipelineId,
    stageIds,
    apply,
  } = useGlobalFilters();

  const effectivePreset = localPreset || preset;
  const effectiveDateFrom = localDateFrom || dateFrom;
  const effectiveDateTo = localDateTo || dateTo;
  const effectivePipelineId = localPipelineId || pipelineId;

  const managers = managerOptions?.managers ?? [];
  const pipelines = useMemo<PipelineStageGroup[]>(
    () =>
      (pipelinesData ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        stages: p.stages,
      })),
    [pipelinesData],
  );
  const stagesByPipeline = useMemo(() => {
    if (!effectivePipelineId) return pipelines;
    return pipelines.filter((p) => p.id === effectivePipelineId);
  }, [effectivePipelineId, pipelines]);

  const groupedStages = useMemo(() => {
    const inScope = stagesByPipeline.flatMap((p) => p.stages);
    return {
      won: inScope.filter((s) => s.type === "won"),
      progress: inScope.filter((s) => s.type === "progress"),
      lost: inScope.filter((s) => s.type === "lost"),
      ignore: inScope.filter((s) => s.type === "ignore"),
    };
  }, [stagesByPipeline]);

  function applyPreset(next: GlobalFilterPreset) {
    const now = new Date();
    const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate(),
    ).padStart(2, "0")}`;
    const start = new Date(now);
    if (next === "today") {
      const today = end;
      setLocalPreset(next);
      setLocalDateFrom(today);
      setLocalDateTo(today);
      return;
    }
    if (next === "7d") start.setDate(start.getDate() - 7);
    else if (next === "30d") start.setDate(start.getDate() - 30);
    const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(
      start.getDate(),
    ).padStart(2, "0")}`;
    setLocalPreset(next);
    setLocalDateFrom(from);
    setLocalDateTo(end);
  }

  return (
    <div className="glass rounded-[18px] border p-3" style={{ borderColor: "var(--border)" }}>
      <div className="grid gap-3 lg:grid-cols-4">
        {showPeriod ? (
          <div className="lg:col-span-1">
            <p className="mb-2 text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--hint)" }}>
              Период
            </p>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => {
                const active = effectivePreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    className="rounded-[8px] px-2 py-1 text-[12px] font-semibold"
                    style={{
                      background: active ? "linear-gradient(135deg, #7B5CF5, #9B7FF8)" : "transparent",
                      color: active ? "#ffffff" : "#888888",
                      border: active ? "none" : "1px solid var(--border2)",
                      boxShadow: active ? "0 2px 10px rgba(123,92,245,0.4)" : "none",
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            {effectivePreset === "custom" ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input type="date" value={effectiveDateFrom} onChange={(e) => setLocalDateFrom(e.target.value)} className="rounded-[8px] border px-2 py-1.5 text-[12px]" style={{ borderColor: "var(--border2)", background: "var(--surface)", color: "var(--text)" }} />
                <input type="date" value={effectiveDateTo} onChange={(e) => setLocalDateTo(e.target.value)} className="rounded-[8px] border px-2 py-1.5 text-[12px]" style={{ borderColor: "var(--border2)", background: "var(--surface)", color: "var(--text)" }} />
              </div>
            ) : null}
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--hint)" }}>Менеджеры</p>
          <ManagerSelect
            managers={managers.map((m) => ({ id: m.externalId || m.id, name: m.name }))}
            selected={managerIds}
            onChange={(ids) => apply({ managerIds: ids })}
          />
        </div>

        <div>
          <p className="mb-2 text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--hint)" }}>Воронка</p>
          <select
            value={effectivePipelineId}
            onChange={(e) => {
              const nextPipelineId = e.target.value;
              const defaultWon = defaultWonStagesForPipeline(pipelines, nextPipelineId);
              setLocalPipelineId(nextPipelineId);
              setDraftStageIds(defaultWon);
              apply({ pipelineId: nextPipelineId, stageIds: defaultWon });
            }}
            className="w-full rounded-[12px] border px-2 py-2 text-[12px]"
            style={{ borderColor: "var(--border2)", background: "var(--surface)", color: "var(--text)" }}
          >
            <option value="">Все воронки</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {showStages && Boolean(effectivePipelineId) ? (
          <div className="relative">
            <p className="mb-2 text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--hint)" }}>Этапы</p>
            <button type="button" onClick={() => { setDraftStageIds(stageIds); setOpenStages((s) => !s); }} className="w-full rounded-[12px] border px-2 py-2 text-left text-[12px]" style={{ borderColor: "var(--border2)", background: "var(--surface)", color: "var(--text)" }}>
              {stageIds.length ? `Выбрано: ${stageIds.length}` : "Все этапы ▼"}
            </button>
            {openStages ? (
              <div
                className="absolute mt-1 max-h-72 w-full overflow-auto rounded-[12px] border p-2"
                style={{
                  zIndex: 100,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "#1a2236",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                }}
              >
                <label className="mb-1 flex items-center gap-2 text-[12px]" style={{ color: "var(--text)" }}>
                  <input type="checkbox" checked={draftStageIds.length === 0} onChange={() => setDraftStageIds([])} />
                  Все этапы
                </label>
                {(["won", "progress", "lost", "ignore"] as const).map((groupType) => (
                  <div key={groupType} className="mb-2 border-t pt-2" style={{ borderColor: "var(--border)" }}>
                    <p className="mb-1 text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--hint)" }}>
                      {groupType === "won"
                        ? "ПРОДАЖА"
                        : groupType === "progress"
                          ? "В РАБОТЕ"
                          : groupType === "lost"
                            ? "ПРОВАЛ"
                            : "ИГНОР"}
                    </p>
                    {groupedStages[groupType].map((s) => {
                      const checked = draftStageIds.includes(s.externalId);
                      return (
                        <label
                          key={s.externalId}
                          className="flex items-center gap-2 rounded-[8px] px-2 py-1 text-[12px]"
                          style={{ color: "rgba(240,244,255,0.8)" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setDraftStageIds((prev) =>
                                prev.includes(s.externalId)
                                  ? prev.filter((x) => x !== s.externalId)
                                  : [...prev, s.externalId],
                              )
                            }
                          />
                          <span>{s.name}</span>
                        </label>
                      );
                    })}
                  </div>
                ))}
                <button type="button" onClick={() => { apply({ stageIds: draftStageIds }); setOpenStages(false); }} className="btn-primary mt-2 rounded-[12px] px-3 py-1.5 text-[12px] font-semibold">
                  Применить
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() =>
            apply({
              dateFrom: effectiveDateFrom,
              dateTo: effectiveDateTo,
              preset: effectivePreset,
              pipelineId: effectivePipelineId,
            })
          }
          className="btn-primary rounded-[12px] px-4 py-2 text-[13px] font-semibold"
        >
          Применить
        </button>
      </div>
    </div>
  );
}
