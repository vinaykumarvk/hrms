import { FoundationError } from "../platform/types";
import { ApiQuery, PageResult, PaginationRequest } from "./apiTypes";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export function parsePagination(query: ApiQuery = {}): PaginationRequest {
  const rawLimit = query.limit;
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : DEFAULT_LIMIT;
  if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
    throw new FoundationError("VALIDATION_FAILED", "limit must be a positive number", { field: "limit" });
  }
  return {
    limit: Math.min(parsedLimit, MAX_LIMIT),
    cursor: query.cursor,
  };
}

export function pageItems<TItem>(items: TItem[], pagination: PaginationRequest): PageResult<TItem> {
  const start = pagination.cursor ? Number.parseInt(pagination.cursor, 10) : 0;
  if (!Number.isFinite(start) || start < 0) {
    throw new FoundationError("VALIDATION_FAILED", "cursor is invalid", { field: "cursor" });
  }
  const selected = items.slice(start, start + pagination.limit);
  const next = start + selected.length < items.length ? String(start + selected.length) : null;
  return {
    items: selected,
    limit: pagination.limit,
    next_cursor: next,
  };
}
