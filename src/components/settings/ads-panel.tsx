"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Settings → «Рекламные кабинеты»: подключение Meta / TikTok / Google Ads.
 *
 * Контракты бэка:
 *  GET  /api/integrations/{meta,tiktok}/auth        → 302 OAuth
 *  GET  /api/integrations/{meta,tiktok,google-ads}/accounts → {connections}
 *  POST /api/integrations/{...}/sync        body {connectionId, windowDays?}
 *  POST /api/integrations/{...}/disconnect  body {connectionId}
 *  GET  /api/integrations/google/connections       → {connections} GoogleConnection
 *  GET  /api/integrations/google-ads/customers?googleConnectionId=...
 *                                                  → {customers: [id...]}
 *  POST /api/integrations/google-ads/link   body {googleConnectionId, customerId, ...}
 */

type AdConnection = {
  id: string;
  accountId: string;
  accountName: string | null;
  status: "ACTIVE" | "DISCONNECTED" | "ERROR" | string;
  lastSyncAt: string | null;
  lastError: string | null;
  tokenExpiresAt?: string | null;
  createdAt: string;
};

type GoogleConn = {
  id: string;
  email: string;
  adsEnabled: boolean;
  adsCustomerId: string | null;
};

const PLATFORMS = [
  { key: "meta", label: "Meta (Facebook / Instagram)" },
  { key: "tiktok", label: "TikTok Ads" },
] as const;

type PlatformKey = (typeof PLATFORMS)[number]["key"];

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function statusBadge(status: string): { label: string; color: string } {
  if (status === "ACTIVE") return { label: "Активно", color: "#C8FF00" };
  if (status === "ERROR") return { label: "Ошибка", color: "#f87171" };
  return { label: "Отключено", color: "#888888" };
}

export function AdsPanel() {
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<AdConnection[]>([]);
  const [tiktok, setTiktok] = useState<AdConnection[]>([]);
  const [google, setGoogle] = useState<AdConnection[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [m, t, g] = await Promise.all([
        fetch("/api/integrations/meta/accounts", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/integrations/tiktok/accounts", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/integrations/google-ads/accounts", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setMeta(m.connections ?? []);
      setTiktok(t.connections ?? []);
      setGoogle(g.connections ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function sync(platform: PlatformKey | "google-ads", connectionId: string) {
    setBusy(connectionId);
    setErr(null);
    try {
      const res = await fetch(`/api/integrations/${platform}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const json = await res.json();
      if (!json.ok) setErr(json.error ?? "Ошибка синхронизации");
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка синхронизации");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(platform: PlatformKey | "google-ads", connectionId: string) {
    if (!confirm("Отключить этот рекламный аккаунт?")) return;
    setBusy(connectionId);
    setErr(null);
    try {
      const res = await fetch(`/api/integrations/${platform}/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const json = await res.json();
      if (!json.ok) setErr(json.error ?? "Ошибка отключения");
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка отключения");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div
        className="glass max-w-4xl rounded-[18px] border p-5 text-[13px]"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
      >
        Загрузка рекламных кабинетов…
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-4">
      {err ? (
        <div
          className="rounded-[10px] border px-3 py-2 text-[12px]"
          style={{ borderColor: "#f87171", color: "#f87171" }}
        >
          {err}
        </div>
      ) : null}

      <PlatformSection
        title={PLATFORMS[0].label}
        platform="meta"
        connections={meta}
        busy={busy}
        onSync={(id) => sync("meta", id)}
        onDisconnect={(id) => disconnect("meta", id)}
        connectHref="/api/integrations/meta/auth"
      />

      <PlatformSection
        title={PLATFORMS[1].label}
        platform="tiktok"
        connections={tiktok}
        busy={busy}
        onSync={(id) => sync("tiktok", id)}
        onDisconnect={(id) => disconnect("tiktok", id)}
        connectHref="/api/integrations/tiktok/auth"
      />

      <GoogleAdsSection
        connections={google}
        busy={busy}
        onSync={(id) => sync("google-ads", id)}
        onDisconnect={(id) => disconnect("google-ads", id)}
        onLinked={reload}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

type PlatformSectionProps = {
  title: string;
  platform: PlatformKey;
  connections: AdConnection[];
  busy: string | null;
  onSync: (id: string) => void;
  onDisconnect: (id: string) => void;
  connectHref: string;
};

function PlatformSection({
  title,
  connections,
  busy,
  onSync,
  onDisconnect,
  connectHref,
}: PlatformSectionProps) {
  return (
    <div
      className="glass rounded-[18px] border p-5"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
          {title}
        </h2>
        <a
          href={connectHref}
          className="rounded-[8px] border px-3 py-1.5 text-[12px] font-medium"
          style={{
            background: "linear-gradient(135deg, #7B5CF5, #9B7FF8)",
            borderColor: "transparent",
            color: "#fff",
          }}
        >
          Подключить аккаунт
        </a>
      </div>

      {connections.length === 0 ? (
        <p className="text-[12px]" style={{ color: "var(--muted)" }}>
          Нет подключённых аккаунтов.
        </p>
      ) : (
        <ul className="space-y-2">
          {connections.map((c) => (
            <ConnectionRow
              key={c.id}
              conn={c}
              busy={busy === c.id}
              onSync={() => onSync(c.id)}
              onDisconnect={() => onDisconnect(c.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

type ConnectionRowProps = {
  conn: AdConnection;
  busy: boolean;
  onSync: () => void;
  onDisconnect: () => void;
};

function ConnectionRow({ conn, busy, onSync, onDisconnect }: ConnectionRowProps) {
  const s = statusBadge(conn.status);
  return (
    <li
      className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border px-3 py-2"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
            style={{ background: s.color, color: "#111" }}
          >
            {s.label}
          </span>
          <span className="truncate text-[13px]" style={{ color: "var(--text)" }}>
            {conn.accountName ?? conn.accountId}
          </span>
        </div>
        <div className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
          <span>ID: {conn.accountId}</span> · <span>Синхрон: {fmtDate(conn.lastSyncAt)}</span>
          {conn.lastError ? (
            <span style={{ color: "#f87171" }}> · {conn.lastError}</span>
          ) : null}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onSync}
          className="rounded-[8px] border px-2.5 py-1 text-[12px]"
          style={{
            borderColor: "var(--border)",
            color: "var(--text)",
            opacity: busy ? 0.5 : 1,
          }}
        >
          {busy ? "…" : "Синхронизировать"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDisconnect}
          className="rounded-[8px] border px-2.5 py-1 text-[12px]"
          style={{
            borderColor: "#f87171",
            color: "#f87171",
            opacity: busy ? 0.5 : 1,
          }}
        >
          Отключить
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------

type GoogleAdsSectionProps = {
  connections: AdConnection[];
  busy: string | null;
  onSync: (id: string) => void;
  onDisconnect: (id: string) => void;
  onLinked: () => void;
};

function GoogleAdsSection({
  connections,
  busy,
  onSync,
  onDisconnect,
  onLinked,
}: GoogleAdsSectionProps) {
  const [showLink, setShowLink] = useState(false);
  const [googleConns, setGoogleConns] = useState<GoogleConn[]>([]);
  const [googleConnectionId, setGoogleConnectionId] = useState("");
  const [customers, setCustomers] = useState<string[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [loginCustomerId, setLoginCustomerId] = useState("");
  const [developerToken, setDeveloperToken] = useState("");
  const [accountName, setAccountName] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkErr, setLinkErr] = useState<string | null>(null);

  async function openDialog() {
    setShowLink(true);
    setLinkErr(null);
    try {
      const res = await fetch("/api/integrations/google/connections", { cache: "no-store" });
      const json = await res.json();
      const list = (json.connections ?? []) as GoogleConn[];
      setGoogleConns(list);
      if (list.length > 0 && !googleConnectionId) {
        setGoogleConnectionId(list[0]!.id);
      }
    } catch (e) {
      setLinkErr(e instanceof Error ? e.message : "Ошибка загрузки Google подключений");
    }
  }

  async function loadCustomers() {
    if (!googleConnectionId) return;
    setLinkBusy(true);
    setLinkErr(null);
    try {
      const params = new URLSearchParams({ googleConnectionId });
      if (developerToken.trim()) params.set("developerToken", developerToken.trim());
      const res = await fetch(`/api/integrations/google-ads/customers?${params}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!json.ok) {
        setLinkErr(json.error ?? "Не удалось получить список customers");
        setCustomers([]);
      } else {
        setCustomers(json.customers ?? []);
        if ((json.customers?.length ?? 0) > 0 && !customerId) {
          setCustomerId(json.customers[0]);
        }
      }
    } catch (e) {
      setLinkErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLinkBusy(false);
    }
  }

  async function submitLink() {
    if (!googleConnectionId || !customerId) return;
    setLinkBusy(true);
    setLinkErr(null);
    try {
      const res = await fetch("/api/integrations/google-ads/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleConnectionId,
          customerId: customerId.replace(/-/g, ""),
          accountName: accountName.trim() || undefined,
          loginCustomerId: loginCustomerId.trim() || undefined,
          developerToken: developerToken.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setLinkErr(json.error ?? "Ошибка линковки");
        return;
      }
      setShowLink(false);
      setCustomerId("");
      setLoginCustomerId("");
      setAccountName("");
      onLinked();
    } catch (e) {
      setLinkErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLinkBusy(false);
    }
  }

  return (
    <div
      className="glass rounded-[18px] border p-5"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
          Google Ads
        </h2>
        <button
          type="button"
          onClick={openDialog}
          className="rounded-[8px] border px-3 py-1.5 text-[12px] font-medium"
          style={{
            background: "linear-gradient(135deg, #7B5CF5, #9B7FF8)",
            borderColor: "transparent",
            color: "#fff",
          }}
        >
          Привязать customer
        </button>
      </div>

      {connections.length === 0 ? (
        <p className="text-[12px]" style={{ color: "var(--muted)" }}>
          Нет привязанных customer. Сначала подключите Google (Интеграции), затем
          нажмите «Привязать customer».
        </p>
      ) : (
        <ul className="space-y-2">
          {connections.map((c) => (
            <ConnectionRow
              key={c.id}
              conn={c}
              busy={busy === c.id}
              onSync={() => onSync(c.id)}
              onDisconnect={() => onDisconnect(c.id)}
            />
          ))}
        </ul>
      )}

      {showLink ? (
        <div
          className="mt-4 space-y-3 rounded-[10px] border p-3"
          style={{ borderColor: "var(--border)" }}
        >
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
            Привязка Google Ads customer
          </h3>
          {linkErr ? (
            <div className="text-[12px]" style={{ color: "#f87171" }}>
              {linkErr}
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-[11px] uppercase" style={{ color: "var(--muted)" }}>
              Google подключение
            </label>
            {googleConns.length === 0 ? (
              <div className="text-[12px]" style={{ color: "var(--muted)" }}>
                Нет Google-подключений. Подключите Google на вкладке «Интеграции».
              </div>
            ) : (
              <select
                value={googleConnectionId}
                onChange={(e) => setGoogleConnectionId(e.target.value)}
                className="w-full rounded-[8px] border px-2 py-1.5 text-[12px]"
                style={{ borderColor: "var(--border)", background: "transparent", color: "var(--text)" }}
              >
                {googleConns.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.email}
                    {g.adsCustomerId ? ` (default: ${g.adsCustomerId})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] uppercase" style={{ color: "var(--muted)" }}>
                Developer token (опц.)
              </label>
              <input
                value={developerToken}
                onChange={(e) => setDeveloperToken(e.target.value)}
                placeholder="если не задан в GoogleConnection"
                className="w-full rounded-[8px] border px-2 py-1.5 text-[12px] font-mono"
                style={{ borderColor: "var(--border)", background: "transparent", color: "var(--text)" }}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase" style={{ color: "var(--muted)" }}>
                Login customer (MCC, опц.)
              </label>
              <input
                value={loginCustomerId}
                onChange={(e) => setLoginCustomerId(e.target.value)}
                placeholder="1234567890"
                className="w-full rounded-[8px] border px-2 py-1.5 text-[12px] font-mono"
                style={{ borderColor: "var(--border)", background: "transparent", color: "var(--text)" }}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!googleConnectionId || linkBusy}
              onClick={loadCustomers}
              className="rounded-[8px] border px-2.5 py-1 text-[12px]"
              style={{
                borderColor: "var(--border)",
                color: "var(--text)",
                opacity: !googleConnectionId || linkBusy ? 0.5 : 1,
              }}
            >
              {linkBusy ? "…" : "Получить список customers"}
            </button>
          </div>

          {customers.length > 0 ? (
            <div>
              <label className="mb-1 block text-[11px] uppercase" style={{ color: "var(--muted)" }}>
                Customer
              </label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full rounded-[8px] border px-2 py-1.5 text-[12px] font-mono"
                style={{ borderColor: "var(--border)", background: "transparent", color: "var(--text)" }}
              >
                {customers.map((cid) => (
                  <option key={cid} value={cid}>
                    {cid}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-[11px] uppercase" style={{ color: "var(--muted)" }}>
                Customer ID (вручную)
              </label>
              <input
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                placeholder="1234567890"
                className="w-full rounded-[8px] border px-2 py-1.5 text-[12px] font-mono"
                style={{ borderColor: "var(--border)", background: "transparent", color: "var(--text)" }}
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-[11px] uppercase" style={{ color: "var(--muted)" }}>
              Название аккаунта (опц.)
            </label>
            <input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Бренд X / Google Ads"
              className="w-full rounded-[8px] border px-2 py-1.5 text-[12px]"
              style={{ borderColor: "var(--border)", background: "transparent", color: "var(--text)" }}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!googleConnectionId || !customerId || linkBusy}
              onClick={submitLink}
              className="rounded-[8px] border px-3 py-1.5 text-[12px] font-medium"
              style={{
                background: "linear-gradient(135deg, #7B5CF5, #9B7FF8)",
                borderColor: "transparent",
                color: "#fff",
                opacity: !googleConnectionId || !customerId || linkBusy ? 0.5 : 1,
              }}
            >
              Привязать
            </button>
            <button
              type="button"
              onClick={() => setShowLink(false)}
              className="rounded-[8px] border px-3 py-1.5 text-[12px]"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
