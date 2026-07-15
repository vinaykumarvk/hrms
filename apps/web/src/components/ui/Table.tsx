import { HTMLAttributes, TableHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import { SortConfig, SortDirection } from "../../lib/useDataTable";

/* ── Container ─────────────────────────────────────────────── */

export function TableContainer({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto rounded-md border",
        className
      )}
      tabIndex={0}
      role="region"
      aria-label="Scrollable data table"
      {...props}
    />
  );
}

/* ── Root Table ────────────────────────────────────────────── */

export function Table({
  className,
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={cn(
        "w-full min-w-max border-collapse text-left text-sm",
        className
      )}
      {...props}
    />
  );
}

/* ── Head ──────────────────────────────────────────────────── */

export function TableHead({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-gray-50", className)} {...props} />;
}

/* ── Body ──────────────────────────────────────────────────── */

export function TableBody({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn("divide-y bg-white", className)}
      {...props}
    />
  );
}

/* ── Row ───────────────────────────────────────────────────── */

export function TableRow({
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("transition-colors", className)}
      {...props}
    />
  );
}

export function TableHeaderRow({
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b-2", className)} {...props} />;
}

/* ── Header Cell ───────────────────────────────────────────── */

export interface TableHeaderCellProps
  extends ThHTMLAttributes<HTMLTableCellElement> {
  columnId?: string;
  sort?: SortConfig<string> | null;
  onSort?: (column: string) => void;
}

export function TableHeaderCell({
  columnId,
  sort,
  onSort,
  className,
  children,
  ...props
}: TableHeaderCellProps) {
  const isSortable = Boolean(columnId && onSort);
  const isActiveSort = sort?.column === columnId;
  const sortIcon = isActiveSort
    ? sort?.direction === "asc"
      ? " ▲"
      : " ▼"
    : "";

  return (
    <th
      className={cn(
        "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-600",
        isSortable && "cursor-pointer select-none hover:bg-gray-100",
        isActiveSort && "text-blue-700",
        className
      )}
      aria-sort={
        isActiveSort
          ? sort?.direction === "asc"
            ? "ascending"
            : "descending"
          : undefined
      }
      onClick={
        isSortable && columnId
          ? () => onSort?.(columnId)
          : undefined
      }
      {...props}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {isSortable && (
          <span className="text-[10px] leading-none text-gray-400" aria-hidden="true">
            {isActiveSort ? sortIcon : " ↕"}
          </span>
        )}
      </span>
    </th>
  );
}

/* ── Data Cell ─────────────────────────────────────────────── */

export function TableCell({
  className,
  ...props
}: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("px-4 py-2.5 text-sm text-gray-700 whitespace-nowrap", className)}
      {...props}
    />
  );
}

/* ── Empty State ───────────────────────────────────────────── */

export interface TableEmptyProps extends HTMLAttributes<HTMLDivElement> {
  message?: string;
  filteredMessage?: string;
  isFiltered?: boolean;
  onClearFilters?: () => void;
}

export function TableEmpty({
  message = "No records found.",
  filteredMessage = "No records match the current filters.",
  isFiltered = false,
  onClearFilters,
  className,
  ...props
}: TableEmptyProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 text-center",
        className
      )}
      {...props}
    >
      <p className="text-sm text-gray-500">
        {isFiltered ? filteredMessage : message}
      </p>
      {isFiltered && onClearFilters && (
        <button
          type="button"
          className="mt-3 text-xs font-medium text-blue-600 hover:text-blue-800 underline cursor-pointer"
          onClick={onClearFilters}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
