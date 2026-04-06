# CRM Sales Analytics Dashboard

Full-stack дашборд: Next.js 14, Prisma, PostgreSQL, интеграции Bitrix24, AmoCRM, Google (Ads / Sheets / GA4), Telegram.

## Быстрый старт

```bash
cp .env.example .env
# Заполните DATABASE_URL, ENCRYPTION_KEY, секреты интеграций

npm install
npx prisma migrate deploy
npm run db:seed   # опционально: тестовые лиды

npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000), дашборд: `/dashboard`.

## Скрипты

| Команда | Описание |
|--------|----------|
| `npm run dev` | Разработка |
| `npm run build` | Сборка |
| `npm run db:seed` | Seed БД |
| `POST /api/cron` | Cron (заголовок `Authorization: Bearer CRON_SECRET`) |

Подробности интеграций — в коде `src/app/api/` и `src/lib/integrations/`.
