import { ReactNode } from "react";
import {
  DataTableState,
  DataTableCallbacks,
  FilterConfig,
  applySort,
  applyFilter,
  applyPagination,
} from "../../lib/useDataTable";
import { FilterBar, FilterColumnDef } from "./FilterBar";
import { Pagination } from "./Pagination";
import {
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderRow,
  TableHeaderCell,
  TableCell,
  TableEmpty,
} from "./Table";

/* ── Column Definition ────────────────────────────────────── */

export interface DataTableColumnDef<TItem, TColumn extends string = string> {
  id: TColumn;
  header: string;
  sortable?: boolean;
  resolve: (item: TItem) => ReactNode;
  sortValue?: (item: TItem) => string | number | undefined;
  filterValue?: (item: TItem) => string;
  className?: string;
  headerClassName?: string;
}

/* ── Main Component ───────────────────────────────────────── */

export interface DataTableProps<TItem, TColumn extends string = string> {
  items: TItem[];
  columns: DataTableColumnDef<TItem, TColumn>[];
  state: DataTableState<TColumn>;
  callbacks: DataTableCallbacks<TColumn>;
  filterColumns?: FilterColumnDef[];
  emptyMessage?: string;
  filteredEmptyMessage?: string;
  isLoading?: boolean;
  loadingRowCount?: number;
  className?: string;
}

export function DataTable<TItem, TColumn extends string = string>({
  items,
  columns,
  state,
  callbacks,
  filterColumns,
  emptyMessage,
  filteredEmptyMessage,
  isLoading = false,
  loadingRowCount = 5,
  className,
}: DataTableProps<TItem, TColumn>) {
  // Client-side pipeline: filter → sort → paginate
  const filtered = applyFilter(items, state.filters as FilterConfig<string>[], (item, col) => {
    const def = columns.find((c) => c.id === col);
    return def?.filterValue?.(item) ?? "";
  });

  const sorted = applySort(filtered, state.sort as any, (item) => {
    const col = columns.find((c) => c.id === state.sort?.column);
    return col?.sortValue?.(item) ?? "";
  });

  const { pageItems, totalPages, totalItems } = applyPagination(sorted, {
    ...state.pagination,
    total: sorted.length,
  });

  const isFiltered = state.filters.length > 0;

  return (
    <div className={className}>
      {filterColumns && filterColumns.length > 0 && (
        <FilterBar
          filters={state.filters as FilterConfig<string>[]}
          onFilter={callbacks.onFilter as any}
          onClear={callbacks.clearFilters}
          columns={filterColumns}
        />
      )}

      <TableContainer>
        <Table>
          <TableHead>
            <TableHeaderRow>
              {columns.map((col) => (
                <TableHeaderCell
                  key={col.id as string}
                  columnId={col.sortable ? (col.id as string) : undefined}
                  sort={state.sort as any}
                  onSort={col.sortable ? (callbacks.onSort as any) : undefined}
                  className={col.headerClassName}
                >
                  {col.header}
                </TableHeaderCell>
              ))}
            </TableHeaderRow>
          </TableHead>

          <TableBody>
            {isLoading
              ? Array.from({ length: loadingRowCount }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    {columns.map((col) => (
                      <TableCell key={col.id as string}>
                        <span className="inline-block h-4 w-24 animate-pulse rounded bg-gray-200" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : pageItems.length === 0
              ? null
              : pageItems.map((item, i) => (
                  <TableRow key={i}>
                    {columns.map((col) => (
                      <TableCell key={col.id as string} className={col.className}>
                        {col.resolve(item)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </Table>

        {!isLoading && pageItems.length === 0 && (
          <TableEmpty
            isFiltered={isFiltered}
            message={emptyMessage}
            filteredMessage={filteredEmptyMessage}
            onClearFilters={isFiltered ? callbacks.clearFilters : undefined}
          />
        )}
      </TableContainer>

      <Pagination
        config={{ ...state.pagination, total: sorted.length }}
        totalPages={totalPages}
        totalItems={totalItems}
        onPageChange={callbacks.onPageChange}
        onPageSizeChange={callbacks.onPageSizeChange}
      />
    </div>
  );
}
