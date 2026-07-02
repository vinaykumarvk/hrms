export type WireErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PRECONDITION_FAILED"
  | "RATE_LIMITED"
  | "INTERNAL";

export interface TenantScope {
  tenantId: string;
  entityId?: string;
  actorUserId?: string;
  correlationId?: string;
}

export interface ActorContext extends TenantScope {
  userId: string;
  roles: string[];
  permissions: string[];
  fieldGrants?: string[];
}

export interface TenantScopedRow {
  tenantId: string;
  entityId?: string;
}

export interface ErrorEnvelope {
  error: {
    code: WireErrorCode;
    message: string;
    field?: string;
    details?: Record<string, unknown>;
  };
}

export class FoundationError extends Error {
  readonly code: WireErrorCode;
  readonly field?: string;
  readonly details?: Record<string, unknown>;

  constructor(code: WireErrorCode, message: string, options: { field?: string; details?: Record<string, unknown> } = {}) {
    super(message);
    this.name = "FoundationError";
    this.code = code;
    this.field = options.field;
    this.details = options.details;
  }
}

export function requireTenantScope(scope: TenantScope): void {
  if (!scope.tenantId) {
    throw new FoundationError("UNAUTHENTICATED", "Tenant scope is required");
  }
}

export function inScope<T extends TenantScopedRow>(row: T, scope: TenantScope): boolean {
  if (row.tenantId !== scope.tenantId) {
    return false;
  }
  return !scope.entityId || !row.entityId || row.entityId === scope.entityId;
}

export function toPublicError(error: unknown): ErrorEnvelope {
  if (error instanceof FoundationError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        field: error.field,
        details: error.details,
      },
    };
  }
  return {
    error: {
      code: "INTERNAL",
      message: "Request failed",
    },
  };
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function pseudoHash64(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const seed = (hash >>> 0).toString(16).padStart(8, "0");
  return seed.repeat(8).slice(0, 64);
}

export function nextId(prefix: string, count: number): string {
  return `${prefix}-${String(count + 1).padStart(6, "0")}`;
}

export function assertNever(value: never): never {
  throw new FoundationError("INTERNAL", `Unhandled value ${String(value)}`);
}
