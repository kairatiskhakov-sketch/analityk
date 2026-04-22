/**
 * Email sender. Поддерживает Resend (https://resend.com) как провайдер.
 *
 * env:
 *   RESEND_API_KEY   — секрет Resend (если нет — отправка превращается в no-op,
 *                       лог в консоль; удобно для dev)
 *   EMAIL_FROM       — "Name <noreply@domain.tld>" (обязательно для Resend)
 *   EMAIL_REPLY_TO   — опциональный reply-to
 */

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export type SendEmailResult =
  | { ok: true; id?: string; skipped?: boolean }
  | { ok: false; error: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function getFrom(): string | null {
  const v = process.env.EMAIL_FROM?.trim();
  return v && v.length > 0 ? v : null;
}

function getApiKey(): string | null {
  const v = process.env.RESEND_API_KEY?.trim();
  return v && v.length > 0 ? v : null;
}

/**
 * Отправить email. Ошибки не бросает — всегда возвращает дискриминированный
 * результат, чтобы API-роут мог продолжить работу даже если почта упала.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = getApiKey();
  const from = getFrom();

  if (!apiKey || !from) {
    // Dev / no provider — логируем вместо отправки
    console.warn(
      "[email] RESEND_API_KEY or EMAIL_FROM not set; skipping send",
      { to: input.to, subject: input.subject },
    );
    return { ok: true, skipped: true };
  }

  const replyTo = input.replyTo ?? process.env.EMAIL_REPLY_TO?.trim();

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: replyTo,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!res.ok) {
      return {
        ok: false,
        error: body.message ?? `Resend error ${res.status}`,
      };
    }

    return { ok: true, id: body.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Email send failed",
    };
  }
}
