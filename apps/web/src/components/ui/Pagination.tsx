import { PaginationConfig } from "../../lib/useDataTable";
import { cn } from "../../lib/cn";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PaginationProps {
  config: PaginationConfig;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

export function Pagination({
  config,
  totalPages,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
}: PaginationProps) {
  const { page, pageSize } = config;
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  if (totalItems <= pageSizeOptions[0]) {
    return (
      <PaginationInfo
        totalItems={totalItems}
        start={start}
        end={end}
        page={page}
        totalPages={totalPages}
      />
    );
  }

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-4 px-4 py-3"
      aria-label="Table pagination"
    >
      <PaginationInfo
        totalItems={totalItems}
        start={start}
        end={end}
        page={page}
        totalPages={totalPages}
      />

      <div className="flex items-center gap-2">
        <select
          className="h-9 rounded-md border bg-white px-2.5 text-xs text-gray-700"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          aria-label="Rows per page"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size} rows
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          <PageButton
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </PageButton>

          {getPageNumbers(page, totalPages).map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className="px-1 text-xs text-gray-400">
                …
              </span>
            ) : (
              <PageButton
                key={p}
                active={p === page}
                onClick={() => onPageChange(p as number)}
                aria-label={`Page ${p}`}
                aria-current={p === page ? "page" : undefined}
              >
                {p}
              </PageButton>
            )
          )}

          <PageButton
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </PageButton>
        </div>
      </div>
    </nav>
  );
}

/* ── Sub-components ────────────────────────────────────────── */

function PaginationInfo({
  totalItems,
  start,
  end,
  page,
  totalPages,
}: {
  totalItems: number;
  start: number;
  end: number;
  page: number;
  totalPages: number;
}) {
  return (
    <span className="text-xs text-gray-500">
      {totalItems === 0
        ? "No records"
        : `Showing ${start}–${end} of ${totalItems}${totalPages > 1 ? ` (page ${page} of ${totalPages})` : ""}`}
    </span>
  );
}

function PageButton({
  active,
  disabled,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md text-xs font-medium transition-colors",
        active
          ? "bg-blue-600 text-white"
          : "text-gray-700 hover:bg-gray-100",
        disabled && "cursor-not-allowed opacity-40",
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

function getPageNumbers(
  current: number,
  total: number
): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [1];

  if (current > 3) pages.push("...");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) pages.push("...");

  pages.push(total);

  return pages;
}
