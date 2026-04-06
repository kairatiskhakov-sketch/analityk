import Link from "next/link";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link href="/dashboard" className="font-semibold text-emerald-400">
            CRM Analytics
          </Link>
          <nav className="flex gap-4 text-sm text-zinc-400">
            <Link href="/dashboard" className="hover:text-zinc-200">
              Дашборд
            </Link>
            <Link href="/dashboard/leads" className="hover:text-zinc-200">
              Лиды
            </Link>
            <Link href="/dashboard/settings" className="hover:text-zinc-200">
              Настройки
            </Link>
          </nav>
          <Link
            href="/"
            className="ml-auto text-xs text-zinc-500 hover:text-zinc-300"
          >
            На главную
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
