import { ReactNode, useId } from "react";
import { cn } from "../../lib/cn";

/* ── SimpleBarChart ────────────────────────────────────────── */

export interface BarChartDatum {
  key: string;
  value: number | null;
  suppressed?: boolean;
  suppressionReason?: string;
}

export interface SimpleBarChartProps {
  data: BarChartDatum[];
  maxBars?: number;
  className?: string;
}

export function SimpleBarChart({ data, maxBars = 20, className }: SimpleBarChartProps) {
  const id = useId();
  const visible = data.slice(0, maxBars);
  const maxValue = Math.max(...visible.map((d) => d.value ?? 0), 1);

  return (
    <div className={cn("space-y-2", className)} role="img" aria-label="Bar chart">
      {visible.map((datum) => (
        <div key={datum.key} className="flex items-center gap-2">
          <span
            className="w-20 shrink-0 truncate text-right text-[11px] font-medium text-gray-600"
            title={datum.key}
          >
            {datum.key}
          </span>

          {datum.suppressed ? (
            <span className="flex-1">
              <span
                className="inline-block h-6 rounded-r border border-dashed border-amber-300 bg-amber-50 px-2 text-[10px] leading-6 text-amber-700"
                style={{ minWidth: "18%" }}
              >
                k-suppressed
              </span>
            </span>
          ) : (
            <span className="flex-1">
              <span
                className={cn(
                  "inline-block h-6 min-w-[4px] rounded-r px-2 text-right text-[10px] font-medium leading-6 tabular-nums text-white",
                  getBarColor(datum.key)
                )}
                style={{ width: `${Math.max((datum.value ?? 0) / maxValue * 100, 2)}%` }}
              >
                {(datum.value ?? 0) >= maxValue * 0.15
                  ? (datum.value ?? 0).toLocaleString()
                  : null}
              </span>
              {(datum.value ?? 0) < maxValue * 0.15 && (
                <span className="ml-2 text-[11px] tabular-nums text-gray-500">
                  {datum.value?.toLocaleString()}
                </span>
              )}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function getBarColor(key: string): string {
  // Stable color per key using simple hash
  const palette = [
    "bg-blue-500", "bg-emerald-500", "bg-violet-500",
    "bg-amber-500", "bg-rose-500", "bg-cyan-500",
    "bg-indigo-500", "bg-teal-500", "bg-orange-500",
    "bg-pink-500",
  ];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash |= 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

/* ── SummaryStat ───────────────────────────────────────────── */

export interface SummaryStatProps {
  label: string;
  value: ReactNode;
  className?: string;
}

export function SummaryStat({ label, value, className }: SummaryStatProps) {
  return (
    <div className={cn("rounded-lg border bg-white px-4 py-3", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight text-gray-900">{value}</p>
    </div>
  );
}

/* ── StatGrid ──────────────────────────────────────────────── */

export interface StatGridProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}

export function StatGrid({ children, columns = 4, className }: StatGridProps) {
  return (
    <div
      className={cn(
        "grid gap-3",
        columns === 2 && "grid-cols-2",
        columns === 3 && "grid-cols-2 sm:grid-cols-3",
        columns === 4 && "grid-cols-2 sm:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}
