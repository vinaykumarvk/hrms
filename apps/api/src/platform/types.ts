import { createHash } from "node:crypto";

export type CanonicalErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PRECONDITION_FAILED"
  | "RATE_LIMITED"
  | "INTERNAL";

/**
 * BRD G01 named domain error codes (docs/brd/v3/G01-employee-profile-management.md,
 * FR-EPM-015/017/018 failure handling): 403 maker==checker on a 4-eyes merge or separation
 * approval; 409 merge of conflicting ACTIVE statutory states without override; 409 merge
 * undo past the configurable window; 409 invalid §10.1 status transition (also reused for
 * promote-active with remaining STRICT gaps — the BRD registers only the 409 status there);
 * 409 archive attempted under an ACTIVE legal hold; 409 separation with open blocking
 * obligations and no override.
 */
export type G01DomainErrorCode =
  | "SOD_VIOLATION"
  | "MERGE_CONFLICT"
  | "UNDO_EXPIRED"
  | "INVALID_STATE"
  | "LEGAL_HOLD_ACTIVE"
  | "BLOCKING_OBLIGATIONS";

/** BRD G03 §8 named domain error codes (docs/brd/v3/G03-attendance-and-leave-management.md). */
export type G03DomainErrorCode =
  | "LEAVE_OVERLAP"
  | "INSUFFICIENT_BALANCE"
  | "OPTIMISTIC_LOCK_CONFLICT"
  | "ELIGIBILITY_FAILED"
  | "ENTITLEMENT_EXCEEDED"
  | "PERIOD_ALREADY_LOCKED"
  | "WINDOW_EXPIRED"
  | "REGULARISATION_LIMIT"
  // PH-15C operational attendance core (BRD G03 FR-01/FR-03/FR-09).
  | "VAL-G03-SHIFT-TIMES"
  | "VAL-G03-ROSTER-OVERLAP"
  | "DEVICE_NOT_AUTHORIZED"
  | "INVALID_PUNCH_TIME"
  | "COMP_OFF_INSUFFICIENT"
  | "COMP_OFF_EXPIRED"
  // PH-17A leave-year close + encashment (BRD G03 FR-15/FR-16).
  | "YEAR_ALREADY_CLOSED"
  | "PENDING_LEAVE_BLOCKS_CLOSE"
  | "ENCASHMENT_CAP_EXCEEDED"
  | "NOT_ENCASHABLE"
  // PH-18B WFH / on-duty attendance exceptions (BRD G03 FR-07/FR-08).
  | "EXCEPTION_OVERLAP"
  | "WFH_CAP_EXCEEDED"
  | "DOCUMENT_REQUIRED"
  // PH-19A blackout periods + mass-leave (BRD G03 FR-23).
  | "BLACKOUT_PERIOD"
  | "RETURN_TO_WORK_PENDING";

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
  | "ENTITY_SUB_JUDICE"
  // FR-PPP-020 rota-quota construction guards: a population entry without its recruitment-stream
  // tag and an invalid ratio/rotation-method fail closed (422, never a silent partial build).
  | "STREAM_TAG_MISSING"
  | "QUOTA_RULE_INVALID";

/**
 * BRD G02 registered domain error codes (docs/brd/v3/G02-personal-details-modification-workflow.md):
 * FR-G02-019 AC3 — risk_band=BLOCKED holds any commit attempt pending fraud review
 * (412 ERR-G02-RISKBLOCK); FR-G02-018 AC1 — self-service on any non-ACTIVE target is
 * rejected fail-closed (403 ERR-G02-STATUSGATE).
 */
export type G02DomainErrorCode =
  | "ERR-G02-RISKBLOCK"
  | "ERR-G02-STATUSGATE"
  // PH-17B FR-015/023: apply/commit without a valid strong e-signature (409); an e-sign whose
  // method is not permitted by policy (422); a HIGH/STATUTORY self-service submit without a
  // completed step-up challenge (403).
  | "ERR-G02-ESIGN"
  | "ERR-G02-ESIGN-METHOD"
  | "ERR-G02-STEPUP";

/**
 * BRD G04 registered codes (docs/brd/v3/G04-leave-sr-integration.md):
 * FR-G04-02 AC3 — two PUBLISHED sr_event_mapping versions for the same
 * (leave_type_code, event_type) may never overlap effective ranges; publish is rejected
 * 409 ERR-G04-MAPPING-OVERLAP (VAL-G04-MAPCOVER). FR-G04-02 AC6 — a POST_SR mapping
 * without a statutory_rule_ref citation is rejected fail-closed 422; the registered
 * validation id VAL-G04-CITATION surfaces as the error code.
 */
export type G04DomainErrorCode = "ERR-G04-MAPPING-OVERLAP" | "VAL-G04-CITATION";

/** BRD G05 §8.2 named domain error codes (docs/brd/v3/G05-transfer-relieving-joining-workflow.md FR-003/007/011/019/020/022 + rules 5/6). */
export type G05DomainErrorCode =
  | "ERR-G05-HANDOVER-DISPUTED"
  | "ERR-G05-DEPUTATION-CAP"
  | "ERR-G05-NOT-SERVED"
  | "ERR-G05-QUARTER-OVERSTAY"
  // PH-16D — BRD G05 §8.2: allotment/join to a filled vacancy (incl. join-time re-check),
  // out-of-turn counselling choice, and asymmetric mutual completion are 409 CONFLICT.
  | "ERR-G05-VACANCY-FULL"
  | "ERR-G05-COUNSEL-TURN"
  | "ERR-G05-MUTUAL-PAIR";

/**
 * BRD G07 registered validation ids surfaced as error codes (docs/brd/v3/G07-training-skill-development.md §11):
 * FR-G07-018 — duplicate external_reference_no for the same employee is 409 VAL-G07-CREDREF;
 * FR-G07-020 / integrity rule 17 — a BREACHED training_sponsorships row must emit a BOND_RECOVERY
 * cost (G10 feed) before it can move to RECOVERED, else 409 VAL-G07-BOND (fail closed).
 */
export type G07DomainErrorCode = "VAL-G07-CREDREF" | "VAL-G07-BOND";

/** BRD G08 §9 named domain error codes (docs/brd/v3/G08-performance-appraisal-management.md error catalogue). */
export type G08DomainErrorCode =
  | "ERR-G08-WEIGHTAGE"
  | "ERR-G08-REPWINDOW"
  // FR-G08-09 (R1): applying a calibration recommendation that is not RATIFIED is 409 CONFLICT.
  | "ERR-G08-RATIFY";

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
  | "ERR-G09-DUE-PROCESS-INCOMPLETE"
  // FR-G09-023: a POSH (HARASSMENT) case without a validly composed ICC cannot proceed (409).
  | "ERR-G09-ICC-PROCEDURE-REQUIRED"
  // FR-G09-025/DI-29: denial of a requested personal hearing without a recorded reason (422).
  | "ERR-G09-PERSONAL-HEARING-DENIED"
  // FR-G09-024/DI-18: resume without an open pause / malformed pause window (409).
  | "ERR-G09-SLA-PAUSE-INVALID"
  // PH-21C FR-026: a proceeding against a retiree beyond the Rule-9 four-year bar, without the
  // required sanction, is barred (409, fail closed).
  | "ERR-G09-RETIREE-PROCEEDING-BARRED"
  // PH-36A FR-023 BR-2: POSH conciliation may not rest on a monetary settlement (422).
  | "ERR-G09-CONCILIATION-MONETARY";

/** BRD G10 §12 named domain error codes (docs/brd/v3/G10-payroll-and-benefits.md FR-01/02/04/07/09/13/14/15/16/22 error catalogue). */
export type G10DomainErrorCode =
  | "ERR-G10-RULE-EXPR"
  | "ERR-G10-RATE-OVERLAP"
  | "ERR-G10-RATE-NOTFOUND"
  | "ERR-G10-PT-STATE"
  | "ERR-G10-RUN-INFLIGHT"
  | "ERR-G10-RUN-IMMUTABLE"
  | "ERR-G10-REOPEN-BLOCKED"
  | "ERR-G10-RECOVERY-NET"
  | "ERR-G10-RECON-TIEOUT"
  | "ERR-G10-RECON-UNSIGNED"
  | "ERR-G10-RECOVERY-BARRED"
  // FR-07: missing TAX_SLAB rate rows for the regime/FY fail closed (422).
  | "ERR-G10-TAXSLAB-NOTFOUND"
  // FR-22/§12: mutation attempted after a snapshot/cutoff freeze (409) — also thrown for
  // tax-declaration mutation after the FY proof cutoff (FR-07 AC3; no declaration-specific
  // code is registered, so the registered freeze code is reused, never a new identifier).
  | "ERR-G10-SNAPSHOT-FROZEN"
  // FR-21: a concessional (is_concessional) perquisite valuation with no effective SBI
  // reference-rate row fails closed (422) rather than valuing the perquisite at zero.
  | "ERR-G10-PERQ-REFRATE";

/** BRD G11 §12 named domain error codes (docs/brd/v3/G11-retirement-and-pension.md FR-05/06/14/19/22 error catalogue). */
export type G11DomainErrorCode =
  | "ERR-G11-RULE-NOT-EFFECTIVE"
  | "ERR-G11-FACTOR-NOT-FOUND"
  | "ERR-G11-SCHEME-MISMATCH"
  | "ERR-G11-COMMUTATION-LIMIT"
  | "ERR-G11-PROVISIONAL-PENDING"
  | "ERR-G11-INVALID-ACCOUNT"
  | "ERR-G11-ACCOUNT-VERIFY"
  // FR-12 AC1: disbursement to a SUSPENDED_NO_LC pensioner is held (409, fail closed).
  | "ERR-G11-LC-SUSPENDED"
  // FR-13 AC4/P05: applied revision batches are immutable; corrections create a new batch.
  | "ERR-G11-REVISION-IMMUTABLE";

/**
 * BRD G13 §10.3 named domain error codes (docs/brd/v3/G13-document-management-secure-storage.md):
 * 409 checked out by another user; 422 stored-bytes SHA-256 mismatch on fetch (FR-015, content
 * withheld + quarantined); 422 infected upload (FR-007/DI-11, QUARANTINED); 403 deny-by-default
 * classification gate miss (FR-006, E21 security_clearances); 403 maker==checker SoD breach on
 * disposition/clearance approval (FR-009/FR-017, DI-10/DI-16); 409 DPDP erasure overridden by
 * statutory retention / legal hold / WORM basis (FR-018, R8 precedence lattice).
 */
export type G13DomainErrorCode =
  | "ERR-G13-DOCUMENT_LOCKED"
  | "ERR-G13-INTEGRITY_FAILED"
  | "ERR-G13-MALWARE_DETECTED"
  | "ERR-G13-CLEARANCE_INSUFFICIENT"
  | "ERR-G13-SOD_VIOLATION"
  | "ERR-G13-ERASURE_EXEMPTED";

/**
 * BRD G14 §8.3 named domain error codes (docs/brd/v3/G14-dashboard-and-analytics.md
 * FR-02/04/16/17/23): 403 small-cell suppression on a below-k cohort (FR-17, k-anonymity)
 * and its complementary suppression; 403 maker==checker scope-policy activation (FR-04 AC7);
 * 409 cross-version KPI aggregation without acknowledgement (FR-02 AC7); 404 as-of-knowledge
 * read with no snapshot known at the requested knowledge_time (FR-23).
 */
export type G14DomainErrorCode =
  | "ERR-G14-SMALL-CELL"
  | "ERR-G14-COMP-SUPPRESS"
  | "ERR-G14-SCOPE-CHECKER"
  | "ERR-G14-XVER-AGG"
  | "ERR-G14-ASOF-NA";

export type WireErrorCode =
  | CanonicalErrorCode
  | G01DomainErrorCode
  | G02DomainErrorCode
  | G03DomainErrorCode
  | G04DomainErrorCode
  | G06DomainErrorCode
  | G05DomainErrorCode
  | G07DomainErrorCode
  | G08DomainErrorCode
  | G09DomainErrorCode
  | G10DomainErrorCode
  | G11DomainErrorCode
  | G13DomainErrorCode
  | G14DomainErrorCode;

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

/**
 * Real SHA-256 (node:crypto createHash) over the exact input bytes, hex-encoded.
 * This is the integrity-substrate hash for the G12 ledger chains and G13 tokens (PH-10A):
 * sha256Hex("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad".
 */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Real SHA-256 over raw bytes (G13 FR-005: content_hash is computed by the service from the
 * actual stored bytes — never trusted from the caller — and re-verified on every fetch).
 */
export function sha256HexBytes(input: Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
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
