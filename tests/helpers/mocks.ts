/**
 * Мок-инфраструктура для интеграционных тестов API-роутов.
 *
 * Мы не крутим реальный Postgres — вместо этого мокнем `@/lib/prisma` и
 * `@/lib/auth/session`, после чего вызываем хендлер напрямую как обычную
 * async-функцию. Тестируем ветки авторизации, валидации и инварианты
 * (last-owner guard, self-transfer block, email mismatch и т.п.).
 *
 * vi.hoisted — чтобы моки были сформированы ДО фактического импорта роутов.
 */

import { vi } from "vitest";

export type PrismaMock = ReturnType<typeof buildPrismaMock>;
export type SessionMock = ReturnType<typeof buildSessionMock>;

/** Собираем "пустой" мок Prisma с нужными нам таблицами. */
export function buildPrismaMock() {
  return {
    orgMember: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    orgInvite: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    orgAudit: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === "function") {
        // transactional callback — передаём сам мок как tx
        return arg(buildTxProxy());
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return undefined;
    }),
  };
}

function buildTxProxy() {
  // В колбэке $transaction код вызывает tx.orgMember.create и т.п.
  // Возвращаем лёгкий прокси: каждая таблица — те же моки, что и у prisma.
  const empty = () => vi.fn().mockResolvedValue({});
  return {
    orgMember: {
      create: empty(),
      update: empty(),
      delete: empty(),
    },
    orgInvite: { update: empty() },
    organization: { findUnique: vi.fn().mockResolvedValue(null) },
    user: { update: empty(), updateMany: empty() },
  };
}

/** Сессия: вернуть залогиненного / гостя. */
export function buildSessionMock() {
  const getSessionUser = vi.fn(() =>
    Promise.resolve<null | SessionUser>(null),
  );
  return {
    getSessionUser,
    setUser(user: SessionUser | null) {
      getSessionUser.mockResolvedValue(user as SessionUser);
    },
  };
}

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  currentOrgId?: string | null;
};

/** Собрать Request с JSON body. */
export function jsonReq(
  method: string,
  url: string,
  body?: unknown,
  init?: RequestInit,
): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...init,
  });
}

/** Прочитать JSON из Response, к которому обратился хендлер. */
export async function jsonBody(res: Response): Promise<any> {
  return res.json();
}
