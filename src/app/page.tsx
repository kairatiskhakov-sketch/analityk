import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">CRM Sales Analytics</h1>
      <p className="text-neutral-500">Дашборд и интеграции готовы к настройке.</p>
      <Link
        href="/dashboard"
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
      >
        Открыть дашборд
      </Link>
    </main>
  );
}
