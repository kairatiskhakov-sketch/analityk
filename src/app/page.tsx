import Link from "next/link";
import { DM_Sans, Inter } from "next/font/google";

const dmSans = DM_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const BADGES = ["Bitrix24", "AmoCRM", "Telegram", "Google Sheets"];

const FEATURES = [
  {
    title: "Воронка лидов",
    desc: "Видишь, на каком этапе теряются клиенты и где усилить продажи.",
  },
  {
    title: "Рейтинг менеджеров",
    desc: "Кто закрывает сделки лучше всех — в одном списке с цифрами.",
  },
  {
    title: "Каналы трафика",
    desc: "Понятно, откуда приходят лиды и какой канал даёт деньги.",
  },
];

export default function Home() {
  const fontStack = `${dmSans.style.fontFamily}, ${inter.style.fontFamily}, system-ui, sans-serif`;

  return (
    <div
      className="min-h-screen"
      style={{
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: fontStack,
      }}
    >
      <header
        className="sticky top-0 z-10 flex items-center justify-between border-b px-5 py-4 md:px-10"
        style={{
          borderColor: "var(--border)",
          background: "rgba(10,10,10,0.88)",
          backdropFilter: "blur(10px)",
        }}
      >
        <Link href="/" className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] text-[15px] font-bold"
            style={{ background: "var(--accent)", color: "#000000" }}
          >
            S
          </div>
          <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--text)" }}>
            Saldo CRM
          </span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-opacity hover:opacity-80"
            style={{ color: "var(--muted)" }}
          >
            Войти
          </Link>
          <Link
            href="/login"
            className="rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition-opacity hover:opacity-90"
            style={{ background: "var(--accent)", color: "#000000" }}
          >
            Начать бесплатно
          </Link>
        </nav>
      </header>

      <main>
        <section
          className="mx-auto max-w-3xl px-5 pb-16 pt-14 text-center md:pb-20 md:pt-20"
          style={{ background: "var(--bg)" }}
        >
          <h1 className="animate-fade-up text-balance text-[1.65rem] font-semibold leading-tight tracking-tight md:text-[2rem]">
            Аналитика продаж в реальном времени
          </h1>
          <p
            className="mx-auto mt-4 max-w-xl text-pretty text-[15px] leading-relaxed md:text-base"
            style={{ color: "var(--muted)" }}
          >
            Подключи AmoCRM или Bitrix24 и получи полную картину продаж, лидов и менеджеров в одном
            дашборде
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-2.5">
            <Link
              href="/dashboard"
              className="inline-flex min-w-[200px] items-center justify-center rounded-[10px] px-5 py-2.5 text-[13px] font-semibold transition-opacity hover:opacity-90"
              style={{ background: "var(--accent)", color: "#000000" }}
            >
              Открыть дашборд
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex min-w-[200px] items-center justify-center rounded-[10px] border px-5 py-2.5 text-[13px] font-medium transition-opacity hover:opacity-90"
              style={{
                borderColor: "var(--border2)",
                background: "var(--surface)",
                color: "var(--text)",
              }}
            >
              Смотреть демо
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            {BADGES.map((label) => (
              <span
                key={label}
                className="rounded-full px-3 py-1 text-[11px] font-medium"
                style={{
                  background: "var(--surface2)",
                  color: "var(--muted)",
                  border: "1px solid var(--border)",
                }}
              >
                {label}
              </span>
            ))}
          </div>
        </section>

        <section
          className="border-t px-5 py-14 md:px-10 md:py-16"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="mx-auto grid max-w-5xl gap-3 md:grid-cols-3 md:gap-4">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="animate-fade-up rounded-[12px] border p-5 md:p-6"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  animationDelay: `${0.05 * (i + 1)}s`,
                }}
              >
                <h2 className="text-[15px] font-semibold tracking-tight">{f.title}</h2>
                <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--muted)" }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer
        className="border-t px-5 py-8 text-center text-[12px]"
        style={{ borderColor: "var(--border)", color: "var(--hint)" }}
      >
        © 2026 Saldo CRM
      </footer>
    </div>
  );
}
