/**
 * Уведомление платформенным админам о новой регистрации.
 * Отправляется в `register` после успешного создания юзера.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildAdminNewRegistrationEmail(input: {
  userName: string;
  userEmail: string;
  orgName: string;
  reviewUrl: string;
  registeredAt: Date;
}): { subject: string; html: string; text: string } {
  const name = escapeHtml(input.userName);
  const email = escapeHtml(input.userEmail);
  const org = escapeHtml(input.orgName);
  const url = escapeHtml(input.reviewUrl);
  const when = input.registeredAt.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const subject = `Новая регистрация: ${input.userName} · Saldo CRM`;

  const html = `<!doctype html>
<html lang="ru">
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e8e8f0;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
      <div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#7B5CF5,#E040FB);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;">S</div>
      <div>
        <div style="font-size:16px;font-weight:600;color:#ffffff;">Saldo CRM · admin</div>
        <div style="font-size:11px;color:#9b9baf;">Новая регистрация требует решения</div>
      </div>
    </div>

    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:18px;padding:24px;">
      <h1 style="margin:0 0 12px 0;font-size:20px;color:#ffffff;font-weight:600;">Новый пользователь зарегистрировался</h1>
      <p style="margin:0 0 16px 0;font-size:14px;line-height:1.5;color:#cccce0;">
        Аккаунт находится в статусе <strong style="color:#FBBF24;">PENDING</strong> — войти в систему он не сможет, пока вы не одобрите его.
      </p>

      <table style="width:100%;border-collapse:collapse;margin:0 0 20px 0;font-size:13px;color:#cccce0;">
        <tr><td style="padding:6px 0;color:#9b9baf;width:120px;">Имя:</td><td style="padding:6px 0;color:#ffffff;">${name}</td></tr>
        <tr><td style="padding:6px 0;color:#9b9baf;">Email:</td><td style="padding:6px 0;color:#ffffff;">${email}</td></tr>
        <tr><td style="padding:6px 0;color:#9b9baf;">Организация:</td><td style="padding:6px 0;color:#ffffff;">${org}</td></tr>
        <tr><td style="padding:6px 0;color:#9b9baf;">Когда:</td><td style="padding:6px 0;color:#ffffff;">${when}</td></tr>
      </table>

      <a href="${url}"
         style="display:inline-block;padding:12px 20px;border-radius:10px;background:linear-gradient(135deg,#7B5CF5,#E040FB);color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;">
        Перейти к рассмотрению →
      </a>
    </div>

    <p style="margin:24px 0 0 0;font-size:11px;color:#6b6b80;text-align:center;">
      Это автоматическое уведомление платформенным администраторам Saldo CRM.
    </p>
  </div>
</body>
</html>`;

  const text = [
    `Новая регистрация в Saldo CRM`,
    "",
    `Имя: ${input.userName}`,
    `Email: ${input.userEmail}`,
    `Организация: ${input.orgName}`,
    `Когда: ${when}`,
    "",
    `Статус: PENDING — пользователь не сможет войти, пока вы не одобрите его.`,
    "",
    `Открыть в админке: ${input.reviewUrl}`,
  ].join("\n");

  return { subject, html, text };
}
