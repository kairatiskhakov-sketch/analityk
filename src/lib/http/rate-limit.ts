/**
 * Простой in-memory rate-limit (token bucket + sliding window по минуте).
 * Для публичных эндпоинтов (/api/track), чтобы не уронить инстанс.
 *
 * Ограничения:
 *  — в serverless каждый инстанс держит свой counter (нет глобальной синхронизации).
 *    Для MVP достаточно: защищает от петель и глупых флудов из одного источника.
 *  — для сильной защиты перед прод-нагрузкой нужен Redis/KV (TODO).
 */

type Bucket = { count: number; resetAt: number };

const BUCKETS: Map<string, Bucket> = new Map();
const MAX_KEYS = 10_000;

function cleanup(now: number): void {
  if (BUCKETS.size < MAX_KEYS) return;
  BUCKETS.forEach((b, k) => {
    if (b.resetAt <= now) BUCKETS.delete(k);
  });
  // если всё равно слишком много — сбрасываем полностью
  if (BUCKETS.size >= MAX_KEYS) BUCKETS.clear();
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
};

/**
 * Проверить лимит для ключа (обычно IP или `ip:trackingKey`).
 * windowMs — длина окна (по умолчанию 60_000), limit — макс. запросов в окно.
 */
export function rateLimit(
  key: string,
  opts: { limit?: number; windowMs?: number } = {},
): RateLimitResult {
  const limit = opts.limit ?? 60;
  const windowMs = opts.windowMs ?? 60_000;
  const now = Date.now();
  cleanup(now);

  let b = BUCKETS.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    BUCKETS.set(key, b);
  }
  b.count += 1;

  const allowed = b.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - b.count),
    resetAt: b.resetAt,
    limit,
  };
}
