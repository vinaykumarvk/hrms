import { useCallback, useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

export interface SortConfig<TColumn extends string = string> {
  column: TColumn;
  direction: SortDirection;
}

export interface FilterConfig<TColumn extends string = string> {
  column: TColumn;
  value: string;
}

export interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
}

export interface DataTableState<TColumn extends string = string> {
  sort: SortConfig<TColumn> | null;
  filters: FilterConfig<TColumn>[];
  pagination: PaginationConfig;
}

export interface DataTableCallbacks<TColumn extends string = string> {
  onSort: (column: TColumn) => void;
  onFilter: (column: TColumn, value: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  clearFilters: () => void;
  clearSort: () => void;
}

/**
 * Self-contained data table state management hook.
 * Manages sort, filter, and pagination in one call.
 */
export function useDataTable<TColumn extends string = string>(
  initialPageSize: number = 25
): [DataTableState<TColumn>, DataTableCallbacks<TColumn>] {
  const [sort, setSort] = useState<SortConfig<TColumn> | null>(null);
  const [filters, setFilters] = useState<FilterConfig<TColumn>[]>([]);
  const [pagination, setPagination] = useState<PaginationConfig>({
    page: 1,
    pageSize: initialPageSize,
    total: 0,
  });

  const onSort = useCallback((column: TColumn) => {
    setSort((prev) => {
      if (prev?.column === column) {
        if (prev.direction === "asc") return { column, direction: "desc" };
        if (prev.direction === "desc") return null;
      }
      return { column, direction: "asc" };
    });
  }, []);

  const onFilter = useCallback((column: TColumn, value: string) => {
    setFilters((prev) => {
      const rest = prev.filter((f) => f.column !== column);
      if (!value) return rest;
      return [...rest, { column, value }];
    });
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const onPageChange = useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  const onPageSizeChange = useCallback((size: number) => {
    setPagination({ page: 1, pageSize: size, total: 0 });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters([]);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const clearSort = useCallback(() => {
    setSort(null);
  }, []);

  const state = useMemo(
    () => ({ sort, filters, pagination }),
    [sort, filters, pagination]
  );

  const callbacks = useMemo(
    () => ({ onSort, onFilter, onPageChange, onPageSizeChange, clearFilters, clearSort }),
    [onSort, onFilter, onPageChange, onPageSizeChange, clearFilters, clearSort]
  );

  return [state, callbacks];
}

/**
 * Client-side sort: stable, case-insensitive string comparison.
 */
export function applySort<TItem>(
  items: TItem[],
  config: SortConfig<string> | null,
  resolve: (item: TItem) => string | number | undefined
): TItem[] {
  if (!config) return items;
  const multiplier = config.direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const va = resolve(a) ?? "";
    const vb = resolve(b) ?? "";
    if (typeof va === "number" && typeof vb === "number") {
      return (va - vb) * multiplier;
    }
    const sa = String(va).toLowerCase();
    const sb = String(vb).toLowerCase();
    if (sa < sb) return -1 * multiplier;
    if (sa > sb) return 1 * multiplier;
    return 0;
  });
}

/**
 * Client-side filter: substring match on a column value.
 */
export function applyFilter<TItem>(
  items: TItem[],
  filters: FilterConfig<string>[],
  resolve: (item: TItem, column: string) => string
): TItem[] {
  if (filters.length === 0) return items;
  return items.filter((item) =>
    filters.every((f) => {
      const cellValue = resolve(item, f.column).toLowerCase();
      return cellValue.includes(f.value.toLowerCase());
    })
  );
}

/**
 * Client-side pagination: slice the page from filtered results.
 */
export function applyPagination<TItem>(
  items: TItem[],
  config: PaginationConfig
): { pageItems: TItem[]; totalPages: number; totalItems: number } {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / config.pageSize));
  const start = (config.page - 1) * config.pageSize;
  return {
    pageItems: items.slice(start, start + config.pageSize),
    totalPages,
    totalItems,
  };
}
