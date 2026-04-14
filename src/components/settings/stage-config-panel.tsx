"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type StageRow = {
  externalId: string;
  name: string;
  sort: number;
  pipelineId: string;
  pipelineName: string;
  type: string;
  fromDb: boolean;
};

type PipelineGroup = {
  id: string;
  name: string;
  sort: number;
  stages: StageRow[];
};

const TYPE_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: "won", label: "✅ Продажа", color: "var(--accent)" },
  { value: "lost", label: "❌ Провал", color: "var(--red)" },
  { value: "progress", label: "🔄 В работе", color: "var(--amber)" },
  { value: "ignore", label: "⏭ Игнорировать", color: "var(--hint)" },
];

export function StageConfigPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pipelines, setPipelines] = useState<PipelineGroup[]>([]);
  const [configuredCount, setConfiguredCount] = useState(0);
  const [hasBitrix, setHasBitrix] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/settings/stages", { cache: "no-store" });
      const j = (await r.json()) as {
        ok?: boolean;
        pipelines?: PipelineGroup[];
        configuredCount?: number;
        hasBitrix?: boolean;
        error?: string;
      };
      if (!r.ok || j.ok === false) {
        toast.error(j.error ?? "Не удалось загрузить этапы");
        return;
      }
      setPipelines(j.pipelines ?? []);
      setConfiguredCount(j.configuredCount ?? 0);
      setHasBitrix(j.hasBitrix ?? false);
      const d: Record<string, string> = {};
      for (const p of j.pipelines ?? []) {
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
        });
      }
    }
    setSaving(true);
    try {
      const r = await fetch("/api/settings/stages", {
        method: "POST",
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
          disabled={loading}
          onClick={() => void load()}
          className="rounded-[8px] border px-3 py-2 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{
            borderColor: "var(--border2)",
            color: "var(--text)",
            background: "var(--surface2)",
          }}
        >
          {loading ? "Загрузка…" : "Загрузить этапы из Bitrix"}
        </button>
        <button
          type="button"
          disabled={saving || loading || !hasBitrix}
          onClick={() => void save()}
          className="rounded-[8px] px-4 py-2 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#000000" }}
        >
          {saving ? "Сохранение…" : "Сохранить настройки"}
        </button>
      </div>

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
          {pipelines.map((p) => (
            <div key={p.id}>
              <p
                className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "var(--muted)" }}
              >
                {p.name}
              </p>
              <table className="w-full min-w-[480px] border-collapse text-[13px]">
                <tbody>
                  {p.stages.map((s) => {
                    const val = draft[s.externalId] ?? s.type;
                    const opt = TYPE_OPTIONS.find((o) => o.value === val);
                    return (
                      <tr
                        key={s.externalId}
                        className="border-t"
                        style={{ borderColor: "#1a1a1a" }}
                      >
                        <td
                          className="py-2 pr-3"
                          style={{ color: "var(--text)" }}
                        >
                          {s.name}
                        </td>
                        <td className="py-2 text-right">
                          <select
                            value={val}
                            onChange={(e) =>
                              setType(s.externalId, e.target.value)
                            }
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
