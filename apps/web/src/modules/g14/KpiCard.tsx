import { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface KpiCardProps {
  title: string;
  value: number | null;
  unit?: string;
  trend?: "UP" | "DOWN" | "FLAT";
  suppressed?: boolean;
  suppressionReason?: string;
  description?: string;
  sourceMart?: string;
  version?: number;
  className?: string;
}

export function KpiCard({
  title,
  value,
  unit,
  trend,
  suppressed = false,
  suppressionReason,
  description,
  sourceMart,
  version,
  className,
}: KpiCardProps) {
  const TrendIcon = trend === "UP" ? TrendingUp : trend === "DOWN" ? TrendingDown : Minus;
  const trendColor =
    trend === "UP" ? "text-green-600" : trend === "DOWN" ? "text-red-500" : "text-gray-400";

  return (
    <article
      data-suppressed={suppressed ? "true" : undefined}
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-white p-5 transition-shadow hover:shadow-md",
        className
      )}
    >
      {/* KPI Value */}
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-wider text-gray-500">
            {title}
          </p>
          <div className="mt-2 flex items-baseline gap-1.5">
            {suppressed ? (
              <span className="text-sm font-medium text-amber-600">
                Suppressed
              </span>
            ) : (
              <>
                <span className="sr-only">
                  {value?.toLocaleString() ?? "—"}{unit ? ` ${unit}` : ""}
                </span>
                <span className="text-3xl font-bold tracking-tight text-gray-900 tabular-nums">
                  {value?.toLocaleString() ?? "—"}
                </span>
                {unit && (
                  <span className="text-sm font-medium text-gray-400">{unit}</span>
                )}
              </>
            )}
          </div>
          {suppressed && suppressionReason && (
            <p className="mt-1 text-[11px] text-amber-600/80">
              k-anonymity: {suppressionReason}
            </p>
          )}
        </div>

        {/* Trend indicator */}
        {trend && !suppressed && (
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-full",
              trend === "UP" && "bg-green-50",
              trend === "DOWN" && "bg-red-50",
              trend === "FLAT" && "bg-gray-50"
            )}
            aria-label={`Trend: ${trend.toLowerCase()}`}
          >
            <TrendIcon className={cn("size-4", trendColor)} aria-hidden="true" />
          </span>
        )}
      </div>

      {/* Description */}
      {description && (
        <p className="mt-2 text-xs leading-relaxed text-gray-500 line-clamp-2">
          {description}
        </p>
      )}

      {/* Source */}
      {sourceMart && (
        <div className="mt-3 flex items-center gap-2 border-t pt-3">
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-gray-500">
            {sourceMart}
          </span>
          {version !== undefined && (
            <span className="text-[10px] text-gray-400">v{version}</span>
          )}
        </div>
      )}
    </article>
  );
}
