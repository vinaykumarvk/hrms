import { FoundationError } from "../platform/types";
import { getHeader } from "./correlation";

export const IDEMPOTENCY_HEADER = "Idempotency-Key";

export function requireIdempotencyKey(headers: Record<string, string>): string {
  const key = getHeader(headers, IDEMPOTENCY_HEADER);
  if (!key) {
    throw new FoundationError("VALIDATION_FAILED", "Idempotency-Key is required", { field: IDEMPOTENCY_HEADER });
  }
  return key;
}
