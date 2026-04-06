import Link from "next/link";

export default function Home() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-4 p-8"
      style={{ background: "var(--bg)" }}
    >
      <h1 className="text-2xl font-semibold">CRM Sales Analytics</h1>
      <p style={{ color: "var(--muted)" }}>Дашборд и интеграции готовы к настройке.</p>
      <Link
        href="/dashboard"
        className="rounded-[8px] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        style={{ background: "var(--blue)" }}
      >
        Открыть дашборд
      </Link>
    </main>
  );
}
