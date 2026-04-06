export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Интеграции</h1>
      <p className="text-sm text-zinc-500">
        Подключайте CRM, Google и Telegram через REST API (см. коллекцию
        маршрутов в проекте). Секреты в БД шифруются через{" "}
        <code className="text-emerald-400">ENCRYPTION_KEY</code>.
      </p>
      <ul className="list-inside list-disc space-y-2 text-sm text-zinc-400">
        <li>
          <strong className="text-zinc-300">Bitrix24</strong> —{" "}
          <code>/api/crm/bitrix/connect</code>, sync, test, webhook
        </li>
        <li>
          <strong className="text-zinc-300">AmoCRM</strong> —{" "}
          <code>/api/crm/amo/connect</code>, OAuth, sync
        </li>
        <li>
          <strong className="text-zinc-300">Google</strong> —{" "}
          <code>/api/integrations/google/register</code>, auth, Ads, Sheets,
          GA4
        </li>
        <li>
          <strong className="text-zinc-300">Telegram</strong> —{" "}
          <code>/api/integrations/telegram/connect</code>, webhook
        </li>
        <li>
          <strong className="text-zinc-300">Cron</strong> —{" "}
          <code>POST /api/cron</code> с{" "}
          <code>Authorization: Bearer CRON_SECRET</code>
        </li>
      </ul>
    </div>
  );
}
