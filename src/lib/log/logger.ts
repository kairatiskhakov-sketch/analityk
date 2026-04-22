/**
 * Мини-логгер для серверной части.
 *
 * Цель: давать структурированные JSON-строки в stdout/stderr, которые
 * Vercel собирает автоматически (и которые потом легко экспортируются
 * в Log Drain / Axiom / Datadog без переписывания кода).
 *
 * Не тянем зависимости — плоские объекты, JSON.stringify, ручной redaction.
 *
 * Формат одной записи:
 *   {"ts":"2026-04-22T10:00:00.000Z","level":"info","scope":"webhook.bitrix","msg":"received","reqId":"a1b2c3d4",...}
 *
 * Конвенции:
 *  - `scope`: "webhook.<crm>", "cron.ads", "api.orgs.invites" и т.п.
 *  - НЕ логируем raw body, токены, signature — только идентификаторы и
 *    счётчики. Redactor дополнительно зачищает поля по имени.
 */

export type LogLevel = "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

const SENSITIVE_KEYS = /^(token|secret|password|authorization|cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|webhook[_-]?token|bot[_-]?token|x[_-]?signature)$/i;

function redact(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    // Токены длиннее 12 символов — аккуратно маскируем конец, оставив хвост для диагностики.
    if (value.length > 40 && /^[A-Za-z0-9_.\-+/=]+$/.test(value)) {
      return `${value.slice(0, 6)}…(${value.length}ch)`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(k)) {
        out[k] = typeof v === "string" ? `***(${v.length}ch)` : "***";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

function emit(level: LogLevel, scope: string, msg: string, fields?: LogFields) {
  const record: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg,
  };
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      record[k] = redact(v);
    }
  }
  const line = JSON.stringify(record);
  if (level === "error") {
    // stderr — чтобы Vercel отсепарировал по severity
    // eslint-disable-next-line no-console
    console.error(line);
  } else if (level === "warn") {
    // eslint-disable-next-line no-console
    console.warn(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

export type Logger = {
  scope: string;
  info: (msg: string, fields?: LogFields) => void;
  warn: (msg: string, fields?: LogFields) => void;
  error: (msg: string, fields?: LogFields) => void;
  child: (extraScope: string, extraFields?: LogFields) => Logger;
};

/** Короткий request id — без зависимостей. */
export function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Создать логгер. Если нужны общие поля (reqId / connectionId / orgId) —
 * передать в base, они автоматически мёрджатся в каждую запись.
 */
export function createLogger(scope: string, base: LogFields = {}): Logger {
  const emitWithBase = (level: LogLevel, msg: string, fields?: LogFields) => {
    emit(level, scope, msg, { ...base, ...(fields ?? {}) });
  };
  return {
    scope,
    info: (msg, fields) => emitWithBase("info", msg, fields),
    warn: (msg, fields) => emitWithBase("warn", msg, fields),
    error: (msg, fields) => emitWithBase("error", msg, fields),
    child: (extraScope, extraFields) =>
      createLogger(`${scope}.${extraScope}`, { ...base, ...(extraFields ?? {}) }),
  };
}

/**
 * Преобразовать error → безопасные поля для лога.
 */
export function errorFields(e: unknown): LogFields {
  if (e instanceof Error) {
    return {
      errorName: e.name,
      errorMessage: e.message,
      // stack держим только в level=error — Vercel его нормально рендерит.
      errorStack: e.stack?.split("\n").slice(0, 8).join("\n"),
    };
  }
  return { errorMessage: String(e) };
}
