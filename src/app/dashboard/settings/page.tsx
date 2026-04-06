import Link from "next/link";

export default function SettingsPage() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div>
        <h1
          className="px-6 pt-5 text-[17px] font-medium tracking-tight"
          style={{ color: "var(--text)" }}
        >
          Настройки и интеграции
        </h1>
        <p className="mt-0.5 px-6 text-[11px]" style={{ color: "var(--hint)" }}>
          REST API и маршруты проекта
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div
          className="max-w-2xl space-y-4 rounded-[15px] border p-5"
          style={{
            background: "var(--bg)",
            borderColor: "var(--border)",
          }}
        >
          <p className="text-[13px]" style={{ color: "var(--muted)" }}>
            Подключайте CRM, Google и Telegram через API. Секреты в БД шифруются через{" "}
            <code style={{ color: "var(--blue)" }}>ENCRYPTION_KEY</code>.
          </p>
          <ul className="list-inside list-disc space-y-2 text-[13px]" style={{ color: "var(--muted)" }}>
            <li>
              <strong style={{ color: "var(--text)" }}>Bitrix24</strong> —{" "}
              <code className="text-[12px]">/api/crm/bitrix/connect</code>, sync, test, webhook
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>AmoCRM</strong> —{" "}
              <code className="text-[12px]">/api/crm/amo/connect</code>, OAuth, sync
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>Google</strong> —{" "}
              <code className="text-[12px]">/api/integrations/google/register</code>, auth, Ads, Sheets, GA4
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>Telegram</strong> —{" "}
              <code className="text-[12px]">/api/integrations/telegram/connect</code>, webhook
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>Cron</strong> —{" "}
              <code className="text-[12px]">POST /api/cron</code> с{" "}
              <code>Authorization: Bearer CRON_SECRET</code>
            </li>
          </ul>
          <Link
            href="/"
            className="inline-block text-[13px] font-medium"
            style={{ color: "var(--blue)" }}
          >
            ← На главную
          </Link>
        </div>
      </div>
    </div>
  );
}
