import { FoundationError } from "../platform/types";
import { ApiResponse } from "./apiTypes";
import { getHeader } from "./correlation";

export const IDEMPOTENCY_HEADER = "Idempotency-Key";

export function requireIdempotencyKey(headers: Record<string, string>): string {
  const key = getHeader(headers, IDEMPOTENCY_HEADER);
  if (!key) {
    throw new FoundationError("VALIDATION_FAILED", "Idempotency-Key is required", { field: IDEMPOTENCY_HEADER });
  }
  return key;
}

export function replayStoreKey(tenantId: string, idempotencyKey: string, routeKey: string): string {
  return `${tenantId}|${idempotencyKey}|${routeKey}`;
}

export function payloadFingerprint(body: unknown): string {
  return JSON.stringify(body ?? null);
}

interface ReplayEntry {
  fingerprint: string;
  response: ApiResponse;
}

/**
 * In-memory Idempotency-Key replay store (per kernel instance).
 * Keyed by tenant + Idempotency-Key + route: the first response is stored and
 * returned verbatim on replay; the same key with a different payload is a CONFLICT.
 */
export class IdempotencyReplayStore {
  private readonly entries = new Map<string, ReplayEntry>();

  /** Returns the stored response to replay, or undefined when the key is unseen. */
  replay(key: string, fingerprint: string): ApiResponse | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.fingerprint !== fingerprint) {
      throw new FoundationError("CONFLICT", "Idempotency-Key was already used with a different payload", {
        field: IDEMPOTENCY_HEADER,
      });
    }
    return entry.response;
  }

  record(key: string, fingerprint: string, response: ApiResponse): void {
    if (!this.entries.has(key)) {
      this.entries.set(key, { fingerprint, response });
    }
  }
}
