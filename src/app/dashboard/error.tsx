"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      className="mx-auto flex max-w-lg flex-col items-center space-y-4 px-4 py-16 text-center"
      style={{ color: "var(--text)" }}
    >
      <h1 className="text-xl font-semibold" style={{ color: "var(--red)" }}>
        Ошибка раздела
      </h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {error.message}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-[8px] border px-4 py-2 text-sm transition-opacity hover:opacity-90"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
        }}
      >
        Повторить
      </button>
    </div>
  );
}
