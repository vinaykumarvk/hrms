import { cn } from "../../lib/cn";
import { FilterConfig } from "../../lib/useDataTable";
import { Search, X } from "lucide-react";

export interface FilterBarProps {
  filters: FilterConfig<string>[];
  onFilter: (column: string, value: string) => void;
  onClear: () => void;
  columns: FilterColumnDef[];
  className?: string;
}

export interface FilterColumnDef {
  id: string;
  label: string;
  placeholder?: string;
  type?: "text" | "select";
  options?: { value: string; label: string }[];
}

export function FilterBar({
  filters,
  onFilter,
  onClear,
  columns,
  className,
}: FilterBarProps) {
  const hasActiveFilters = filters.length > 0;

  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3 px-4 py-3 border-b bg-gray-50/50",
        className
      )}
      role="search"
      aria-label="Table filters"
    >
      {columns.map((col) => {
        const active = filters.find((f) => f.column === col.id);
        const placeholder = col.placeholder ?? `Filter ${col.label.toLowerCase()}...`;

        if (col.type === "select" && col.options) {
          return (
            <label key={col.id} className="flex flex-col gap-1 min-w-[140px]">
              <span className="text-[11px] font-semibold uppercase text-gray-500">
                {col.label}
              </span>
              <select
                className="h-9 rounded-md border bg-white px-2.5 text-xs text-gray-700"
                value={active?.value ?? ""}
                onChange={(e) => onFilter(col.id, e.target.value)}
              >
                <option value="">All</option>
                {col.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        return (
          <label key={col.id} className="flex flex-col gap-1 min-w-[160px]">
            <span className="text-[11px] font-semibold uppercase text-gray-500">
              {col.label}
            </span>
            <div className="relative">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-gray-400"
                aria-hidden="true"
              />
              <input
                type="text"
                className="h-9 w-full rounded-md border bg-white pl-8 pr-3 text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                placeholder={placeholder}
                value={active?.value ?? ""}
                onChange={(e) => onFilter(col.id, e.target.value)}
              />
            </div>
          </label>
        );
      })}

      {hasActiveFilters && (
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          onClick={onClear}
        >
          <X className="size-3.5" aria-hidden="true" />
          Clear
        </button>
      )}
    </div>
  );
}
