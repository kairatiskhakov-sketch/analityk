/**
 * Письмо пользователю: его аккаунт одобрен super-admin'ом.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildAccountApprovedEmail(input: {
  userName: string;
  loginUrl: string;
}): { subject: string; html: string; text: string } {
  const name = escapeHtml(input.userName);
  const url = escapeHtml(input.loginUrl);

  const subject = `Аккаунт активирован · Saldo CRM`;

  const html = `<!doctype html>
<html lang="ru">
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e8e8f0;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
      <div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#7B5CF5,#E040FB);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;">S</div>
      <div>
        <div style="font-size:16px;font-weight:600;color:#ffffff;">Saldo CRM</div>
        <div style="font-size:11px;color:#9b9baf;">Dark analytics mode</div>
      </div>
    </div>

    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:18px;padding:24px;">
      <h1 style="margin:0 0 12px 0;font-size:20px;color:#ffffff;font-weight:600;">Добро пожаловать, ${name}!</h1>
      <p style="margin:0 0 16px 0;font-size:14px;line-height:1.5;color:#cccce0;">
        Ваш аккаунт активирован администратором. Теперь можно входить и подключать CRM, рекламные кабинеты и аналитику.
      </p>

      <a href="${url}"
         style="display:inline-block;padding:12px 20px;border-radius:10px;background:linear-gradient(135deg,#7B5CF5,#E040FB);color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;">
        Войти в Saldo CRM →
      </a>

      <p style="margin:16px 0 0 0;font-size:12px;color:#9b9baf;line-height:1.5;">
        Если кнопка не работает — откройте: <span style="color:#9B7FF8;word-break:break-all;">${url}</span>
      </p>
    </div>

    <p style="margin:24px 0 0 0;font-size:11px;color:#6b6b80;text-align:center;">
      Saldo CRM · аналитика продаж и рекламы
    </p>
  </div>
</body>
</html>`;

  const text = [
    `Добро пожаловать, ${input.userName}!`,
    "",
    "Ваш аккаунт активирован администратором Saldo CRM.",
    "",
    `Войти: ${input.loginUrl}`,
  ].join("\n");

  return { subject, html, text };
}
