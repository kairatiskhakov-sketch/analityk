type Role = "OWNER" | "ADMIN" | "VIEWER";

const ROLE_LABEL: Record<Role, string> = {
  OWNER: "владелец",
  ADMIN: "администратор",
  VIEWER: "наблюдатель",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildInviteEmail(input: {
  orgName: string;
  inviterName?: string | null;
  role: Role;
  url: string;
  expiresAt: Date;
}): { subject: string; html: string; text: string } {
  const org = escapeHtml(input.orgName);
  const url = escapeHtml(input.url);
  const inviter = input.inviterName ? escapeHtml(input.inviterName) : null;
  const role = ROLE_LABEL[input.role];
  const expires = input.expiresAt.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const subject = `Приглашение в ${input.orgName} · Saldo CRM`;

  const who = inviter ? `${inviter} приглашает вас` : "Вас приглашают";

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
      <h1 style="margin:0 0 12px 0;font-size:20px;color:#ffffff;font-weight:600;">Приглашение в организацию</h1>
      <p style="margin:0 0 16px 0;font-size:14px;line-height:1.5;color:#cccce0;">
        ${who} присоединиться к организации <strong style="color:#ffffff;">${org}</strong>
        в Saldo CRM в роли «${role}».
      </p>

      <a href="${url}"
         style="display:inline-block;padding:12px 20px;border-radius:10px;background:linear-gradient(135deg,#7B5CF5,#E040FB);color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;">
        Принять приглашение →
      </a>

      <p style="margin:16px 0 0 0;font-size:12px;color:#9b9baf;line-height:1.5;">
        Ссылка действует до <strong style="color:#cccce0;">${expires}</strong>.
        Если кнопка не работает, скопируйте этот URL в браузер:<br/>
        <span style="color:#9B7FF8;word-break:break-all;">${url}</span>
      </p>
    </div>

    <p style="margin:24px 0 0 0;font-size:11px;color:#6b6b80;text-align:center;">
      Если вы не ожидали это письмо — просто проигнорируйте его.
    </p>
  </div>
</body>
</html>`;

  const text = [
    `Приглашение в организацию ${input.orgName}`,
    "",
    inviter
      ? `${input.inviterName} приглашает вас присоединиться в роли «${role}».`
      : `Вас приглашают присоединиться в роли «${role}».`,
    "",
    `Принять приглашение: ${input.url}`,
    "",
    `Ссылка действует до ${expires}.`,
    "",
    "Если вы не ожидали это письмо — просто проигнорируйте его.",
  ].join("\n");

  return { subject, html, text };
}
