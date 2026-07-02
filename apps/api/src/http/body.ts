import { FoundationError } from "../platform/types";

export function readBodyRecord(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new FoundationError("VALIDATION_FAILED", "Request body must be an object", { field: "body" });
  }
  return body as Record<string, unknown>;
}

export function optionalString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new FoundationError("VALIDATION_FAILED", `${field} must be a string`, { field });
  }
  return value;
}

export function requiredString(record: Record<string, unknown>, field: string): string {
  const value = optionalString(record, field);
  if (!value) {
    throw new FoundationError("VALIDATION_FAILED", `${field} is required`, { field });
  }
  return value;
}

export function optionalNumber(record: Record<string, unknown>, field: string): number | undefined {
  const value = record[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new FoundationError("VALIDATION_FAILED", `${field} must be a number`, { field });
  }
  return value;
}

export function optionalBoolean(record: Record<string, unknown>, field: string): boolean | undefined {
  const value = record[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new FoundationError("VALIDATION_FAILED", `${field} must be a boolean`, { field });
  }
  return value;
}

export function optionalRecord(record: Record<string, unknown>, field: string): Record<string, unknown> | undefined {
  const value = record[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new FoundationError("VALIDATION_FAILED", `${field} must be an object`, { field });
  }
  return value as Record<string, unknown>;
}

export function optionalStringArray(record: Record<string, unknown>, field: string): string[] | undefined {
  const value = record[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new FoundationError("VALIDATION_FAILED", `${field} must be a string array`, { field });
  }
  return [...value];
}
