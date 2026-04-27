/**
 * Письмо пользователю: его аккаунт заблокирован super-admin'ом.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildAccountBlockedEmail(input: {
  userName: string;
  reason?: string | null;
}): { subject: string; html: string; text: string } {
  const name = escapeHtml(input.userName);
  const reason = input.reason ? escapeHtml(input.reason) : null;

  const subject = `Доступ к Saldo CRM приостановлен`;

  const html = `<!doctype html>
<html lang="ru">
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e8e8f0;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
      <div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#EF4444,#B91C1C);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;">!</div>
      <div>
        <div style="font-size:16px;font-weight:600;color:#ffffff;">Saldo CRM</div>
        <div style="font-size:11px;color:#9b9baf;">Уведомление</div>
      </div>
    </div>

    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:18px;padding:24px;">
      <h1 style="margin:0 0 12px 0;font-size:20px;color:#ffffff;font-weight:600;">Доступ приостановлен</h1>
      <p style="margin:0 0 16px 0;font-size:14px;line-height:1.5;color:#cccce0;">
        ${name}, доступ к Saldo CRM временно приостановлен администратором платформы.
      </p>

      ${reason
        ? `<div style="margin:0 0 16px 0;padding:12px 14px;border-radius:10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);font-size:13px;color:#fbb;">
            <div style="font-size:11px;color:#9b9baf;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.1em;">Причина</div>
            ${reason}
          </div>`
        : ""}

      <p style="margin:0;font-size:13px;line-height:1.5;color:#cccce0;">
        Если вы считаете, что это ошибка — свяжитесь с администратором.
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = [
    `Доступ к Saldo CRM приостановлен`,
    "",
    `${input.userName}, доступ к Saldo CRM временно приостановлен администратором.`,
    "",
    input.reason ? `Причина: ${input.reason}` : null,
    "",
    "Если считаете, что это ошибка — свяжитесь с администратором.",
  ]
    .filter((s) => s !== null)
    .join("\n");

  return { subject, html, text };
}
