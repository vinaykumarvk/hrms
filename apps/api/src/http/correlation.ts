import { ApiHeaders } from "./apiTypes";

export const CORRELATION_HEADER = "X-Correlation-Id";

export function normalizeHeaders(headers: ApiHeaders = {}): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      normalized[key.toLowerCase()] = value;
    }
  }
  return normalized;
}

export function getHeader(headers: Record<string, string>, name: string): string | undefined {
  return headers[name.toLowerCase()];
}

export function resolveCorrelationId(headers: Record<string, string>, routeKey: string): string {
  return getHeader(headers, CORRELATION_HEADER) ?? `corr-${Math.abs(hashRoute(routeKey)).toString(36).padStart(8, "0")}`;
}

function hashRoute(routeKey: string): number {
  let value = 17;
  for (let index = 0; index < routeKey.length; index += 1) {
    value = Math.imul(value, 31) + routeKey.charCodeAt(index);
  }
  return value;
}
