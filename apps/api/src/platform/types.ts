export type CanonicalErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PRECONDITION_FAILED"
  | "RATE_LIMITED"
  | "INTERNAL";

/** BRD G03 §8 named domain error codes (docs/brd/v3/G03-attendance-and-leave-management.md). */
export type G03DomainErrorCode =
  | "LEAVE_OVERLAP"
  | "INSUFFICIENT_BALANCE"
  | "OPTIMISTIC_LOCK_CONFLICT"
  | "ELIGIBILITY_FAILED"
  | "ENTITLEMENT_EXCEEDED"
  | "PERIOD_ALREADY_LOCKED"
  | "WINDOW_EXPIRED"
  | "REGULARISATION_LIMIT";

/** BRD G06 §9.4 named domain error codes (docs/brd/v3/G06-promotion-posting-progression.md). */
export type G06DomainErrorCode =
  | "STRENGTH_INCONSISTENT"
  | "QUOTA_SPLIT_INVALID"
  | "VACANCY_NOT_RECONCILED"
  | "SENIORITY_LIST_NOT_FINAL"
  | "QUORUM_NOT_MET"
  | "PANEL_CONFLICT_OF_INTEREST"
  | "APAR_NOT_USABLE"
  | "OWN_MERIT_MIGRATION_REQUIRED"
  | "ROSTER_POINT_OCCUPIED"
  | "ROSTER_CATEGORY_MISMATCH"
  | "EMPLOYEE_DEBARRED"
  | "ENTITY_SUB_JUDICE";

/** BRD G05 §8.2 named domain error codes (docs/brd/v3/G05-transfer-relieving-joining-workflow.md FR-007/011/020/022). */
export type G05DomainErrorCode =
  | "ERR-G05-HANDOVER-DISPUTED"
  | "ERR-G05-DEPUTATION-CAP"
  | "ERR-G05-NOT-SERVED"
  | "ERR-G05-QUARTER-OVERSTAY";

/** BRD G08 §9 named domain error codes (docs/brd/v3/G08-performance-appraisal-management.md error catalogue). */
export type G08DomainErrorCode =
  | "ERR-G08-WEIGHTAGE"
  | "ERR-G08-REPWINDOW";

/** BRD G09 §10.3 named domain error codes (docs/brd/v3/G09-disciplinary-cases-punishment.md error catalogue). */
export type G09DomainErrorCode =
  | "ERR-G09-AUTHORITY-NOT-COMPETENT"
  | "ERR-G09-CONSULTATION-PENDING"
  | "ERR-G09-PENALTY-EXCEEDS-PROPOSED"
  | "ERR-G09-SUBSISTENCE-OUT-OF-BOUNDS"
  | "ERR-G09-NON-EMPLOYMENT-CERT-REQUIRED"
  | "ERR-G09-CASE-ABATED"
  | "ERR-G09-AUDIT-CHAIN-BROKEN"
  | "ERR-G09-ACTOR-CONFLICT"
  | "ERR-G09-DUE-PROCESS-INCOMPLETE";

export type WireErrorCode = CanonicalErrorCode | G03DomainErrorCode | G06DomainErrorCode | G05DomainErrorCode | G08DomainErrorCode | G09DomainErrorCode;

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
