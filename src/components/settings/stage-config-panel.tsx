"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type StageRow = {
  externalId: string;
  name: string;
  pipelineId: string;
  pipelineName: string;
  type: string;
  sort?: number;
  color?: string | null;
};

type PipelineGroup = {
  id: string;
  name: string;
  stages: StageRow[];
};

const TYPE_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: "won", label: "✅ Продажа", color: "#C8FF00" },
  { value: "lost", label: "❌ Провал", color: "#FF4444" },
  { value: "progress", label: "🔄 В работе", color: "#FFAA00" },
  { value: "ignore", label: "⏭ Игнорировать", color: "#444444" },
];

export function StageConfigPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pipelines, setPipelines] = useState<PipelineGroup[]>([]);
  const [configuredCount, setConfiguredCount] = useState(0);
  const [hasBitrix, setHasBitrix] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [selectedPipeline, setSelectedPipeline] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const statusRes = await fetch("/api/crm/status", {
        cache: "no-store",
        credentials: "include",
      });
      const statusJson = (await statusRes.json()) as {
        bitrix?: { connected?: boolean };
      };
      const isConnected = statusJson?.bitrix?.connected === true;
      setHasBitrix(isConnected);
      if (!isConnected) {
        setPipelines([]);
        setConfiguredCount(0);
        setDraft({});
        return;
      }

      const r = await fetch("/api/settings/stages", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const j = (await r.json()) as {
        ok?: boolean;
        stages?: StageRow[];
        error?: string;
      };
      if (!r.ok || j.ok === false) {
        toast.error(j.error ?? "Не удалось загрузить этапы");
        return;
      }

      const stages = j.stages ?? [];
      const grouped = new Map<string, PipelineGroup>();
      for (const stage of stages) {
        const key = stage.pipelineId || stage.pipelineName || "default";
        const exists = grouped.get(key);
        if (exists) {
          exists.stages.push(stage);
          continue;
        }
        grouped.set(key, {
          id: stage.pipelineId || key,
          name: stage.pipelineName || "Без воронки",
          stages: [stage],
        });
      }
      setPipelines(Array.from(grouped.values()));
      setConfiguredCount(stages.length);
      const d: Record<string, string> = {};
      for (const p of Array.from(grouped.values())) {
        for (const s of p.stages) {
          d[s.externalId] = s.type;
        }
      }
      setDraft(d);
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, []);

  async function syncFromCrm() {
    setSyncing(true);
    try {
      const res = await fetch("/api/settings/stages/sync", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; count?: number };
      if (!res.ok || json.ok === false) {
        toast.error(json.error ?? "Не удалось синхронизировать этапы");
        return;
      }
      toast.success(`Загружено этапов: ${json.count ?? 0}`);
      await load();
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  function setType(externalId: string, type: string) {
    setDraft((prev) => ({ ...prev, [externalId]: type }));
  }

  async function save() {
    const stages: {
      externalId: string;
      name: string;
      pipelineId: string;
      pipelineName: string;
      type: string;
      sort?: number;
      color?: string | null;
    }[] = [];
    for (const p of pipelines) {
      for (const s of p.stages) {
        const type = draft[s.externalId] ?? s.type;
        stages.push({
          externalId: s.externalId,
          name: s.name,
          pipelineId: p.id,
          pipelineName: p.name,
          type,
          sort: s.sort ?? 0,
          color: s.color ?? null,
        });
      }
    }
    setSaving(true);
    try {
      const r = await fetch("/api/settings/stages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || j.ok === false) {
        toast.error(j.error ?? "Не сохранено");
        return;
      }
      toast.success("Настройки этапов сохранены");
      await load();
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="max-w-4xl rounded-[12px] border p-5"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <h2
        className="text-[15px] font-semibold tracking-tight"
        style={{ color: "var(--text)" }}
      >
        Настройка этапов
      </h2>
      <p className="mt-0.5 text-[12px]" style={{ color: "var(--muted)" }}>
        Укажи что означает каждый этап для аналитики
      </p>
      {configuredCount === 0 && hasBitrix ? (
        <p
          className="mt-2 rounded-[8px] border px-3 py-2 text-[12px]"
          style={{
            borderColor: "var(--border)",
            background: "var(--amber-bg)",
            color: "var(--amber)",
          }}
        >
          Этапы ещё не сохранены — аналитика использует автодетект по названиям. Сохрани
          настройки после проверки.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading || syncing || !hasBitrix}
          onClick={() => void syncFromCrm()}
          className="rounded-[8px] border px-3 py-2 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{
            borderColor: "var(--border2)",
            color: "var(--text)",
            background: "var(--surface2)",
          }}
        >
          {syncing ? "Синхронизация…" : "Синхронизировать этапы из CRM"}
        </button>
        <button
          type="button"
          disabled={saving || loading || !hasBitrix}
          onClick={() => void save()}
          className="rounded-[8px] px-4 py-2 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#000000" }}
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </div>

      {hasBitrix && pipelines.length > 0 ? (
        <div className="mt-4 max-w-md">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--hint)" }}>
            Воронка
          </label>
          <select
            value={selectedPipeline}
            onChange={(e) => setSelectedPipeline(e.target.value)}
            className="w-full rounded-[12px] border px-2 py-2 text-[12px]"
            style={{ borderColor: "var(--border2)", background: "var(--surface)", color: "var(--text)" }}
          >
            <option value="all">Все воронки</option>
            {pipelines.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {!hasBitrix ? (
        <p className="mt-4 text-[13px]" style={{ color: "var(--muted)" }}>
          Подключите Bitrix24 выше — затем загрузите этапы.
        </p>
      ) : loading ? (
        <p className="mt-4 text-[13px]" style={{ color: "var(--hint)" }}>
          Загрузка…
        </p>
      ) : (
        <div className="mt-4 space-y-6 overflow-x-auto">
          {pipelines
            .filter((pipeline) => selectedPipeline === "all" || pipeline.id === selectedPipeline)
            .map((p) => (
              <div key={p.id} className="rounded-[14px] border" style={{ borderColor: "var(--border)" }}>
                <div className="border-b px-3 py-2" style={{ borderColor: "var(--border)" }}>
                  <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                    📊 {p.name}
                  </p>
                  <p className="text-[12px]" style={{ color: "var(--hint)" }}>
                    {p.stages.length} этапа
                  </p>
                </div>
                <table className="w-full min-w-[480px] border-collapse text-[13px]">
                  <tbody>
                    {p.stages.map((s) => {
                      const val = draft[s.externalId] ?? s.type;
                      const opt = TYPE_OPTIONS.find((o) => o.value === val);
                      return (
                        <tr
                          key={s.externalId}
                          className="border-t"
                          style={{
                            borderColor: "#1a1a1a",
                            borderLeft: `3px solid ${opt?.color ?? "#FFAA00"}`,
                          }}
                        >
                          <td className="py-2 pr-3 pl-3" style={{ color: "var(--text)" }}>
                            {s.name}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <select
                              value={val}
                              onChange={(e) => setType(s.externalId, e.target.value)}
                              className="max-w-[200px] rounded-[8px] border px-2 py-1.5 text-[12px] font-medium"
                              style={{
                                borderColor: "var(--border2)",
                                background: "var(--surface2)",
                                color: opt?.color ?? "var(--text)",
                              }}
                            >
                              {TYPE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
