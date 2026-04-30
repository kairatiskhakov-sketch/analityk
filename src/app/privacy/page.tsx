import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Политика конфиденциальности — Lumos Analytics",
  description:
    "Политика конфиденциальности SaaS-платформы Lumos Analytics: как мы обрабатываем данные клиентов, рекламные метрики и интеграции CRM.",
};

export default function PrivacyPage() {
  return (
    <main
      className="mx-auto max-w-3xl px-6 py-12"
      style={{ background: "#0a0a0a", color: "#e5e5e5", minHeight: "100vh" }}
    >
      <h1 className="mb-4 text-3xl font-semibold tracking-tight">
        Политика конфиденциальности
      </h1>
      <p className="mb-6 text-sm" style={{ color: "#888" }}>
        Дата вступления в силу: 30 апреля 2026 г.
      </p>

      <Section title="1. Кто мы">
        <p>
          Платформа Lumos Analytics («Платформа», «мы») — SaaS-сервис для
          анализа продаж и рекламной эффективности, объединяющий данные CRM
          (Bitrix24, amoCRM) и рекламных кабинетов (Meta Ads, TikTok Ads,
          Google Ads).
        </p>
      </Section>

      <Section title="2. Какие данные мы собираем">
        <ul className="list-disc space-y-1 pl-6">
          <li>
            Учётные записи администраторов организации (email, имя), которые
            регистрируются для работы в Платформе.
          </li>
          <li>
            Данные CRM: сделки, лиды, контакты, источники, причины отказа,
            выручка, ответственные менеджеры.
          </li>
          <li>
            Данные рекламных кабинетов: бюджет, показы, клики, расход, охват,
            кампании / адсеты / креативы (только метрики, без персональных
            данных аудитории).
          </li>
          <li>
            Технические логи доступа (IP, user-agent, время запроса) для
            обеспечения безопасности.
          </li>
        </ul>
      </Section>

      <Section title="3. Как мы используем данные">
        <p>Данные используются исключительно для:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            отображения статистики продаж и рекламы в личном кабинете
            организации, к которой относятся данные;
          </li>
          <li>
            построения графиков, KPI, отчётов в разделах «Дашборд», «Маркетинг»,
            «Менеджеры», «План/Факт», «Лиды»;
          </li>
          <li>агрегации данных по периодам и атрибуции выручки источникам;</li>
          <li>уведомлений по email о критичных событиях (опционально).</li>
        </ul>
        <p className="mt-2">
          Мы <strong>не продаём</strong> данные третьим лицам, не используем
          их для рекламных таргетингов и не передаём за пределы инфраструктуры
          Платформы.
        </p>
      </Section>

      <Section title="4. Доступ к данным рекламных кабинетов">
        <p>
          Подключение Meta Ads / TikTok Ads / Google Ads выполняется через
          OAuth: клиент сам авторизует Платформу на чтение метрик своего
          рекламного аккаунта. Платформа запрашивает только разрешения на
          чтение (<code>ads_read</code>, <code>read_insights</code>,{" "}
          <code>business_management</code>) — без права создавать или менять
          кампании.
        </p>
        <p className="mt-2">
          Полученные access-токены хранятся в зашифрованном виде на стороне
          Платформы. Клиент в любой момент может отозвать доступ через
          «Настройки → Реклама → Отключить» либо в настройках безопасности
          своего рекламного аккаунта.
        </p>
      </Section>

      <Section title="5. Хранение и защита">
        <p>
          Данные размещаются в инфраструктуре Vercel (фронтенд/функции) и Neon
          Postgres (база данных, регион eu-central). Все соединения — по HTTPS.
          Доступ к продакшен-БД ограничен сервисными ролями. Бэкапы выполняются
          ежедневно.
        </p>
      </Section>

      <Section title="6. Удаление данных">
        <p>
          Запрос на удаление данных организации можно направить на email{" "}
          <a
            className="underline"
            href="mailto:kairatiskhakov@gmail.com"
            style={{ color: "#9B7FF8" }}
          >
            kairatiskhakov@gmail.com
          </a>
          . Удаление выполняется в течение 14 рабочих дней. Также любая
          организация может удалить свой аккаунт самостоятельно в настройках.
        </p>
      </Section>

      <Section title="7. Cookies">
        <p>
          Платформа использует только функциональные cookies, необходимые для
          работы сессии (авторизация, выбор организации). Аналитики и
          трекеров на стороне платформы нет.
        </p>
      </Section>

      <Section title="8. Контакты">
        <p>
          По любым вопросам, связанным с обработкой данных, пишите на{" "}
          <a
            className="underline"
            href="mailto:kairatiskhakov@gmail.com"
            style={{ color: "#9B7FF8" }}
          >
            kairatiskhakov@gmail.com
          </a>
          .
        </p>
      </Section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-lg font-semibold tracking-tight">{title}</h2>
      <div className="space-y-2 text-[14px] leading-relaxed">{children}</div>
    </section>
  );
}
