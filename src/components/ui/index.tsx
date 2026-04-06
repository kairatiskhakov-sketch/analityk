import Link from "next/link";
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
      className={cn("rounded-[15px] border p-[18px_20px]", className)}
      style={{
        background: "var(--bg)",
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
    <div className="mb-3.5 flex items-start justify-between">
      <div>
        <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
          {title}
        </p>
        {sub ? (
          <p className="mt-0.5 text-[10.5px]" style={{ color: "var(--hint)" }}>
            {sub}
          </p>
        ) : null}
      </div>
      {right}
    </div>
  );
}

const CHIP_STYLES = {
  up: { background: "var(--green-bg)", color: "var(--green)" },
  down: { background: "var(--red-bg)", color: "var(--red)" },
  neutral: { background: "var(--surface2)", color: "var(--muted)" },
  blue: { background: "var(--blue-bg)", color: "var(--blue)" },
};

export function KpiCard({
  label,
  value,
  chip,
  progress,
  className,
  style,
}: {
  label: string;
  value: string | number;
  chip?: { text: string; type: "up" | "down" | "neutral" | "blue" };
  progress?: { value: number; label: string };
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn("animate-fade-up rounded-[15px] border p-[16px_18px]", className)}
      style={{
        background: "var(--bg)",
        borderColor: "var(--border)",
        ...style,
      }}
    >
      <p
        className="mb-2 text-[10.5px] uppercase tracking-[0.07em]"
        style={{ color: "var(--hint)" }}
      >
        {label}
      </p>
      <p
        className="mb-2 text-[22px] font-medium leading-none tracking-tight"
        style={{ color: "var(--text)" }}
      >
        {value}
      </p>
      {chip ? (
        <span
          className="inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[10.5px] font-medium"
          style={CHIP_STYLES[chip.type]}
        >
          {chip.text}
        </span>
      ) : null}
      {progress ? (
        <div className="mt-2.5">
          <div
            className="mb-1 flex justify-between text-[10px]"
            style={{ color: "var(--hint)" }}
          >
            <span>{progress.label}</span>
            <span>{progress.value}%</span>
          </div>
          <div
            className="h-[3px] rounded-full"
            style={{ background: "var(--border)" }}
          >
            <div
              className="h-[3px] rounded-full transition-all duration-1000"
              style={{
                width: `${progress.value}%`,
                background: "var(--text)",
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

const RANGE_LABEL: Record<string, string> = {
  "7d": "7 дн",
  "30d": "30 дн",
  "90d": "90 дн",
};

export function PeriodRangeLinks({
  hrefPrefix,
  period,
}: {
  hrefPrefix: "/dashboard" | "/dashboard/leads";
  period: string;
}) {
  const ranges = ["7d", "30d", "90d"] as const;
  return (
    <div
      className="flex gap-0.5 rounded-[8px] border p-[3px]"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      {ranges.map((p) => (
        <Link
          key={p}
          href={`${hrefPrefix}?period=${p}`}
          className="rounded-[6px] px-[11px] py-1 text-[11.5px] transition-all"
          style={{
            background: period === p ? "var(--bg)" : "transparent",
            color: period === p ? "var(--text)" : "var(--muted)",
            fontWeight: period === p ? 500 : 400,
            boxShadow:
              period === p ? "0 1px 3px rgba(0,0,0,0.07)" : "none",
          }}
        >
          {RANGE_LABEL[p] ?? p}
        </Link>
      ))}
    </div>
  );
}

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
    <div className="flex flex-shrink-0 items-center justify-between px-6 pt-5">
      <div>
        <h1
          className="text-[17px] font-medium tracking-tight"
          style={{ color: "var(--text)" }}
        >
          {title}
        </h1>
        {sub ? (
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--hint)" }}>
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
  color = "var(--text)",
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
  won: { label: "Продано", bg: "var(--green-bg)", color: "var(--green)" },
  lost: { label: "Провалено", bg: "var(--red-bg)", color: "var(--red)" },
  new: { label: "Новый", bg: "var(--blue-bg)", color: "var(--blue)" },
  progress: { label: "В работе", bg: "var(--amber-bg)", color: "var(--amber)" },
};

export function StatusBadge({ status }: { status: LeadStatusUi }) {
  const s = STATUS_MAP[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[5px] px-2 py-0.5 text-[10.5px] font-medium"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}
