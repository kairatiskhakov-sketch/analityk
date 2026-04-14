import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn("rounded-[12px] border px-5 py-[18px]", className)}
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3.5 flex items-start justify-between gap-2">
      <div>
        <p
          className="text-[13px] font-medium uppercase tracking-[0.08em]"
          style={{ color: "var(--muted)" }}
        >
          {title}
        </p>
        {sub ? (
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--hint)" }}>
            {sub}
          </p>
        ) : null}
      </div>
      {right}
    </div>
  );
}

const CHIP_STYLES = {
  up: { background: "var(--accent-dim)", color: "var(--accent)" },
  down: { background: "var(--red-bg)", color: "var(--red)" },
  neutral: { background: "var(--surface2)", color: "var(--muted)" },
  blue: { background: "var(--blue-bg)", color: "var(--blue)" },
};

function DefaultKpiIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      className="h-[18px] w-[18px]"
      aria-hidden
    >
      <rect x="2" y="10" width="4" height="8" rx="1" />
      <rect x="8" y="6" width="4" height="12" rx="1" />
      <rect x="14" y="2" width="4" height="16" rx="1" />
    </svg>
  );
}

export function KpiCard({
  label,
  value,
  chip,
  progress,
  icon,
  accentValue,
  className,
  style,
}: {
  label: string;
  value: string | number;
  chip?: { text: string; type: "up" | "down" | "neutral" | "blue" };
  progress?: { value: number; label: string };
  icon?: React.ReactNode;
  /** Крупное число акцентом */
  accentValue?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const barColor = (() => {
    const v = progress?.value ?? 0;
    if (v > 100) return "var(--blue)";
    if (v < 70) return "var(--red)";
    return "var(--accent)";
  })();

  return (
    <div
      className={cn(
        "animate-fade-up relative rounded-[12px] border p-4",
        className,
      )}
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        ...style,
      }}
    >
      <div className="absolute right-3 top-3 text-[var(--accent)] opacity-90">
        {icon ?? <DefaultKpiIcon />}
      </div>
      <p
        className="mb-2 pr-8 text-[11px] font-medium uppercase tracking-[0.1em]"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </p>
      <p
        className={cn(
          "font-metric mb-2 text-[36px] font-bold leading-none tracking-tight",
          accentValue ? "text-[var(--accent)]" : "text-[var(--text)]",
        )}
      >
        {value}
      </p>
      {chip ? (
        <span
          className="inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[10.5px] font-semibold"
          style={CHIP_STYLES[chip.type]}
        >
          {chip.text}
        </span>
      ) : null}
      {progress ? (
        <div className="mt-2.5">
          <div
            className="mb-1 flex justify-between text-[10px] uppercase tracking-wide"
            style={{ color: "var(--hint)" }}
          >
            <span>{progress.label}</span>
            <span className="tabular-nums">{progress.value}%</span>
          </div>
          <div
            className="h-[4px] rounded-full"
            style={{ background: "var(--border)" }}
          >
            <div
              className="h-[4px] rounded-full transition-all duration-1000"
              style={{
                width: `${Math.min(100, progress.value)}%`,
                background: barColor,
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export type { Period } from "@/lib/dashboard/range";

export function PageTopBar({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-shrink-0 items-center justify-between border-b px-6 py-5" style={{ borderColor: "var(--border)" }}>
      <div>
        <h1
          className="text-[20px] font-semibold tracking-tight md:text-[22px]"
          style={{ color: "var(--text)" }}
        >
          {title}
        </h1>
        {sub ? (
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--muted)" }}>
            {sub}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
}

export function MiniBar({
  value,
  max,
  color = "var(--accent)",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      className="h-[3px] w-14 rounded-full"
      style={{ background: "var(--border)" }}
    >
      <div
        className="h-[3px] rounded-full"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

export type LeadStatusUi = "won" | "lost" | "new" | "progress";

const STATUS_MAP: Record<
  LeadStatusUi,
  { label: string; bg: string; color: string }
> = {
  won: { label: "Продано", bg: "var(--green-bg)", color: "var(--accent)" },
  lost: { label: "Провалено", bg: "var(--red-bg)", color: "var(--red)" },
  new: { label: "Новый", bg: "var(--blue-bg)", color: "var(--blue)" },
  progress: { label: "В работе", bg: "var(--amber-bg)", color: "var(--amber)" },
};

export function StatusBadge({ status }: { status: LeadStatusUi }) {
  const s = STATUS_MAP[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[10.5px] font-semibold"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}
