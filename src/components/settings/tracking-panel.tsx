"use client";

import { useEffect, useState } from "react";

type TrackingResponse = {
  ok?: boolean;
  organization?: { id: string; name: string };
  trackingKey?: string;
  scriptTag?: string;
  endpoint?: string;
  error?: string;
};

/**
 * Settings → «Трекинг»: показывает готовый <script> для вставки на лендинг
 * клиента и endpoint /api/track. Ключ тянется из /api/organization/tracking.
 */
export function TrackingPanel() {
  const [data, setData] = useState<TrackingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<"script" | "endpoint" | "key" | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/organization/tracking", { cache: "no-store" });
        const json = (await res.json()) as TrackingResponse;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Ошибка";
          setData({ ok: false, error: msg });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copy(kind: "script" | "endpoint" | "key", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied((cur) => (cur === kind ? null : cur)), 1500);
    } catch {
      /* clipboard заблокирован — игнорируем */
    }
  }

  if (loading) {
    return (
      <div
        className="glass max-w-3xl rounded-[18px] border p-5 text-[13px]"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
      >
        Загружаем ключ трекинга…
      </div>
    );
  }

  if (!data?.ok || !data.trackingKey || !data.scriptTag) {
    return (
      <div
        className="glass max-w-3xl rounded-[18px] border p-5 text-[13px]"
        style={{ borderColor: "var(--border)", color: "var(--danger, #f87171)" }}
      >
        {data?.error ?? "Не удалось получить трекинг-ключ."}
      </div>
    );
  }

  return (
    <div
      className="glass max-w-3xl space-y-4 rounded-[18px] border p-5"
      style={{ borderColor: "var(--border)" }}
    >
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
          Сниппет для лендинга
        </h2>
        <p className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>
          Вставьте в <code style={{ color: "var(--blue)" }}>&lt;head&gt;</code> страницы: скрипт
          проставит cookie посетителя, прочитает UTM / fbclid / gclid / ttclid и отправит их на{" "}
          <code style={{ color: "var(--blue)" }}>/api/track</code>.
        </p>
      </div>

      <div>
        <label
          className="mb-1 block text-[11px] uppercase tracking-wide"
          style={{ color: "var(--muted)" }}
        >
          Script tag
        </label>
        <pre
          className="overflow-x-auto rounded-[10px] border p-3 text-[12px] leading-relaxed"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface2, rgba(255,255,255,0.03))",
            color: "var(--text)",
          }}
        >
          <code>{data.scriptTag}</code>
        </pre>
        <button
          type="button"
          onClick={() => copy("script", data.scriptTag!)}
          className="mt-2 rounded-[8px] border px-3 py-1.5 text-[12px] font-medium"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        >
          {copied === "script" ? "Скопировано ✓" : "Скопировать script"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label
            className="mb-1 block text-[11px] uppercase tracking-wide"
            style={{ color: "var(--muted)" }}
          >
            Tracking key
          </label>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={data.trackingKey}
              className="flex-1 rounded-[8px] border px-2 py-1.5 text-[12px] font-mono"
              style={{ borderColor: "var(--border)", background: "transparent", color: "var(--text)" }}
            />
            <button
              type="button"
              onClick={() => copy("key", data.trackingKey!)}
              className="rounded-[8px] border px-2 py-1.5 text-[12px]"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            >
              {copied === "key" ? "✓" : "Копировать"}
            </button>
          </div>
        </div>

        <div>
          <label
            className="mb-1 block text-[11px] uppercase tracking-wide"
            style={{ color: "var(--muted)" }}
          >
            Endpoint
          </label>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={data.endpoint ?? ""}
              className="flex-1 rounded-[8px] border px-2 py-1.5 text-[12px] font-mono"
              style={{ borderColor: "var(--border)", background: "transparent", color: "var(--text)" }}
            />
            <button
              type="button"
              onClick={() => copy("endpoint", data.endpoint ?? "")}
              className="rounded-[8px] border px-2 py-1.5 text-[12px]"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            >
              {copied === "endpoint" ? "✓" : "Копировать"}
            </button>
          </div>
        </div>
      </div>

      <details className="text-[12px]" style={{ color: "var(--muted)" }}>
        <summary
          className="cursor-pointer select-none text-[13px]"
          style={{ color: "var(--text)" }}
        >
          Как это работает
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Сниппет ставит cookie <code>_otvid</code> (UUID v4, 2 года) — это{" "}
            <code>visitorId</code>.
          </li>
          <li>
            При загрузке страницы отправляет на <code>/api/track</code> URL, referrer,
            UTM, fbclid / gclid / ttclid, userAgent.
          </li>
          <li>
            В форме лендинга добавьте скрытое поле{" "}
            <code>&lt;input type=&quot;hidden&quot; name=&quot;visitor_id&quot; value=&quot;&quot; /&gt;</code>{" "}
            и перед отправкой формы установите в него{" "}
            <code>window.OrgTrack?.visitorId</code>. Тогда CRM-сделка будет связана с
            рекламной кампанией автоматически.
          </li>
          <li>
            В Bitrix24 создайте custom-поле <code>UF_CRM_VISITOR_ID</code> (строка);
            в AmoCRM — кастомное поле с кодом <code>visitor_id</code>.
          </li>
        </ul>
      </details>
    </div>
  );
}
