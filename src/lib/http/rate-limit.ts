/**
 * Rate-limit с двумя режимами:
 *
 *  1) Upstash Redis REST (durable, общий для всех инстансов)
 *     env:
 *       UPSTASH_REDIS_REST_URL
 *       UPSTASH_REDIS_REST_TOKEN
 *     Реализация: fixed-window counter через INCR + EXPIRE (NX).
 *     Вызываем pipeline-ом за один HTTP-запрос.
 *
 *  2) Fallback: in-memory (per-instance).
 *     Используется, если Upstash env не заданы, а также если Upstash упал —
 *     тогда деградируем молча, чтобы не ронять публичный эндпоинт.
 *
 * API остался одним вызовом `rateLimit(key, opts)`, но теперь async.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number; // ms-epoch
  limit: number;
};

type Bucket = { count: number; resetAt: number };
const BUCKETS: Map<string, Bucket> = new Map();
const MAX_KEYS = 10_000;

function memoryCleanup(now: number): void {
  if (BUCKETS.size < MAX_KEYS) return;
  BUCKETS.forEach((b, k) => {
    if (b.resetAt <= now) BUCKETS.delete(k);
  });
  if (BUCKETS.size >= MAX_KEYS) BUCKETS.clear();
}

function memoryRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): RateLimitResult {
  memoryCleanup(now);
  let b = BUCKETS.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    BUCKETS.set(key, b);
  }
  b.count += 1;
  return {
    allowed: b.count <= limit,
    remaining: Math.max(0, limit - b.count),
    resetAt: b.resetAt,
    limit,
  };
}

function upstashEnv(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token };
}

/**
 * Один HTTP-запрос к Upstash pipeline:
 *   INCR key
 *   PEXPIRE key windowMs NX   -- устанавливает TTL только если его нет
 *   PTTL key                  -- сколько ещё жить, чтобы посчитать resetAt
 *
 * Возвращает null, если Upstash недоступен / вернул ошибку.
 */
async function upstashRateLimit(
  env: { url: string; token: string },
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): Promise<RateLimitResult | null> {
  const redisKey = `rl:${key}`;
  try {
    const res = await fetch(`${env.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["PEXPIRE", redisKey, String(windowMs), "NX"],
        ["PTTL", redisKey],
      ]),
      // Безопасный дефолт: публичный endpoint не должен висеть при сетевых проблемах.
      // AbortController гарантирует, что мы не заблокируем инстанс больше чем на 500ms.
      signal: AbortSignal.timeout(500),
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = (await res.json().catch(() => null)) as
      | Array<{ result?: unknown; error?: string }>
      | null;
    if (!data || data.length < 3) return null;

    const countRaw = data[0]?.result;
    const ttlRaw = data[2]?.result;
    const count = typeof countRaw === "number" ? countRaw : Number(countRaw);
    const ttlMs = typeof ttlRaw === "number" ? ttlRaw : Number(ttlRaw);
    if (!Number.isFinite(count)) return null;

    // Если PEXPIRE NX не сработал (уже был TTL) и PTTL вернул < 0 — подстрахуемся.
    const resetAt =
      Number.isFinite(ttlMs) && ttlMs > 0 ? now + ttlMs : now + windowMs;

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt,
      limit,
    };
  } catch {
    return null;
  }
}

/**
 * Основной API. Всегда возвращает результат — даже если Upstash лёг,
 * упадём на in-memory fallback.
 *
 * @param key     обычно `scope:ip` или `scope:ip:tenant`
 * @param opts    limit (по умолчанию 60) и windowMs (по умолчанию 60_000)
 */
export async function rateLimit(
  key: string,
  opts: { limit?: number; windowMs?: number } = {},
): Promise<RateLimitResult> {
  const limit = opts.limit ?? 60;
  const windowMs = opts.windowMs ?? 60_000;
  const now = Date.now();

  const env = upstashEnv();
  if (env) {
    const up = await upstashRateLimit(env, key, limit, windowMs, now);
    if (up) return up;
    // upstash лёг — тихо деградируем
  }

  return memoryRateLimit(key, limit, windowMs, now);
}
