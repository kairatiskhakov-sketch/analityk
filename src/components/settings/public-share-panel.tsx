"use client";

import { useEffect, useState } from "react";
import {
  SHARE_SECTION_LABELS,
  type ShareSection,
} from "@/lib/org/public-share-shared";

type ShareConfig = {
  token: string | null;
  enabled: boolean;
  sections: ShareSection[];
  availableSections: ShareSection[];
};

const ALL_SECTIONS: ShareSection[] = [
  "dashboard",
  "marketing",
  "managers",
  "plan",
  "leads",
];

export function PublicSharePanel() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [config, setConfig] = useState<ShareConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 1. Узнаём текущую org через /api/orgs (первая в списке = текущая)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/orgs", { cache: "no-store" });
        const j = (await r.json()) as {
          orgs?: { id: string; isCurrent?: boolean }[];
        };
        if (cancelled) return;
        const current =
          j.orgs?.find((o) => o.isCurrent) ?? j.orgs?.[0] ?? null;
        if (!current) {
          setError("Не удалось определить организацию");
          setLoading(false);
          return;
        }
        setOrgId(current.id);
        const r2 = await fetch(`/api/orgs/${current.id}/share`, {
          cache: "no-store",
        });
        const j2 = (await r2.json()) as ShareConfig & {
          ok?: boolean;
          error?: string;
        };
        if (cancelled) return;
        if (!r2.ok) {
          setError(j2.error ?? "Ошибка загрузки");
        } else {
          setConfig(j2);
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Ошибка сети");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function patch(body: {
    enabled?: boolean;
    sections?: ShareSection[];
    regenerate?: boolean;
  }) {
    if (!orgId) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/orgs/${orgId}/share`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as ShareConfig & { error?: string };
      if (!r.ok) {
        setError(j.error ?? "Ошибка сохранения");
      } else {
        setConfig(j);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  function toggleSection(section: ShareSection) {
    if (!config) return;
    const next = config.sections.includes(section)
      ? config.sections.filter((s) => s !== section)
      : [...config.sections, section];
    void patch({ sections: next });
  }

  async function copy() {
    if (!config?.token) return;
    const url = `${window.location.origin}/p/${config.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div
        className="glass rounded-[18px] border p-5"
        style={{ borderColor: "var(--border)" }}
      >
        <p className="text-[12px]" style={{ color: "var(--muted)" }}>
          Загрузка…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="glass rounded-[18px] border p-5"
        style={{ borderColor: "var(--border)" }}
      >
        <p className="text-[13px]" style={{ color: "var(--red)" }}>
          {error}
        </p>
      </div>
    );
  }

  if (!config || !orgId) return null;

  const shareUrl = config.token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/p/${config.token}`
    : "";
  const canPublish = config.sections.length > 0 && Boolean(config.token);

  return (
    <div className="space-y-4">
      {/* Тумблер + URL */}
      <div
        className="glass rounded-[18px] border p-5"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p
              className="text-[13px] font-medium uppercase tracking-[0.08em]"
              style={{ color: "var(--muted)" }}
            >
              Публичная ссылка
            </p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text)" }}>
              Откройте отчёт без входа в систему. Подойдёт, чтобы показать
              аналитику руководителю или партнёру.
            </p>
          </div>
          <button
            type="button"
            disabled={saving || (!config.enabled && config.sections.length === 0)}
            onClick={() => patch({ enabled: !config.enabled })}
            className="rounded-[10px] border px-4 py-2 text-[13px] font-medium"
            style={{
              background: config.enabled
                ? "var(--green-bg)"
                : "transparent",
              color: config.enabled ? "var(--green)" : "var(--text)",
              borderColor: config.enabled ? "var(--green)" : "var(--border)",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {config.enabled ? "● Опубликовано" : "Опубликовать"}
          </button>
        </div>

        {!config.enabled && config.sections.length === 0 ? (
          <p
            className="mt-3 text-[12px]"
            style={{ color: "var(--hint)" }}
          >
            Сначала отметьте хотя бы один раздел ниже.
          </p>
        ) : null}

        {config.enabled && config.token ? (
          <div
            className="mt-4 flex flex-wrap items-center gap-2 rounded-[10px] border px-3 py-2"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            <input
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 bg-transparent text-[12px] outline-none"
              style={{ color: "var(--text)", minWidth: 280 }}
            />
            <button
              type="button"
              onClick={copy}
              className="rounded-[8px] px-3 py-1.5 text-[12px] font-medium"
              style={{
                background: copied ? "var(--green-bg)" : "var(--blue-bg)",
                color: copied ? "var(--green)" : "var(--blue)",
              }}
            >
              {copied ? "✓ Скопировано" : "Копировать"}
            </button>
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-[8px] px-3 py-1.5 text-[12px] font-medium no-underline"
              style={{ background: "var(--surface2)", color: "var(--text)" }}
            >
              Открыть ↗
            </a>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              patch({
                regenerate: true,
                enabled: config.enabled,
              })
            }
            className="rounded-[8px] border px-3 py-1.5 text-[12px]"
            style={{
              borderColor: "var(--border)",
              color: "var(--muted)",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {config.token ? "Сгенерировать новую ссылку" : "Сгенерировать ссылку"}
          </button>
          {config.token ? (
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                if (
                  !window.confirm(
                    "Отключить публикацию и удалить текущую ссылку? Старая ссылка перестанет работать.",
                  )
                ) {
                  return;
                }
                if (!orgId) return;
                setSaving(true);
                try {
                  const r = await fetch(`/api/orgs/${orgId}/share`, {
                    method: "DELETE",
                  });
                  const j = (await r.json()) as { error?: string };
                  if (!r.ok) {
                    setError(j.error ?? "Ошибка");
                  } else {
                    setConfig({
                      ...config,
                      token: null,
                      enabled: false,
                      sections: [],
                    });
                  }
                } finally {
                  setSaving(false);
                }
              }}
              className="rounded-[8px] border px-3 py-1.5 text-[12px]"
              style={{
                borderColor: "rgba(255,80,80,0.4)",
                color: "var(--red)",
              }}
            >
              Снять с публикации и удалить ссылку
            </button>
          ) : null}
        </div>

        {config.enabled && !canPublish ? (
          <p
            className="mt-3 text-[12px]"
            style={{ color: "var(--amber)" }}
          >
            Выбраны 0 разделов или нет токена — публичная ссылка не работает.
          </p>
        ) : null}
      </div>

      {/* Какие разделы открывать */}
      <div
        className="glass rounded-[18px] border p-5"
        style={{ borderColor: "var(--border)" }}
      >
        <p
          className="text-[13px] font-medium uppercase tracking-[0.08em]"
          style={{ color: "var(--muted)" }}
        >
          Разделы по ссылке
        </p>
        <p className="mt-1 text-[12px]" style={{ color: "var(--hint)" }}>
          Отметьте, какие разделы будут видны посетителям ссылки.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ALL_SECTIONS.map((s) => {
            const checked = config.sections.includes(s);
            return (
              <label
                key={s}
                className="flex cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2"
                style={{
                  background: checked
                    ? "rgba(123,92,245,0.08)"
                    : "var(--surface)",
                  borderColor: checked ? "var(--accent)" : "var(--border)",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={saving}
                  onChange={() => toggleSection(s)}
                  className="h-4 w-4 cursor-pointer"
                />
                <span
                  className="text-[13px]"
                  style={{ color: "var(--text)" }}
                >
                  {SHARE_SECTION_LABELS[s]}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Безопасность */}
      <div
        className="glass rounded-[18px] border p-4"
        style={{ borderColor: "var(--border)" }}
      >
        <p className="text-[12px]" style={{ color: "var(--muted)" }}>
          ⚠ Любой человек со ссылкой увидит выбранные разделы. Публичная
          ссылка не показывает страницу настроек, профиль и админку. Чтобы
          закрыть доступ — отключите публикацию или сгенерируйте новую
          ссылку (старая перестанет работать).
        </p>
      </div>
    </div>
  );
}
