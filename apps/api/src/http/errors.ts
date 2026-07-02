import { ErrorEnvelope, FoundationError, WireErrorCode, toPublicError } from "../platform/types";

export const canonicalApiErrorCodes: WireErrorCode[] = [
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "RATE_LIMITED",
  "INTERNAL",
];

export function statusForError(code: WireErrorCode): number {
  switch (code) {
    case "VALIDATION_FAILED":
      return 400;
    case "UNAUTHENTICATED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
    case "LEAVE_OVERLAP":
    case "INSUFFICIENT_BALANCE":
    case "OPTIMISTIC_LOCK_CONFLICT":
    case "ENTITLEMENT_EXCEEDED":
    case "PERIOD_ALREADY_LOCKED":
    case "REGULARISATION_LIMIT":
    case "STRENGTH_INCONSISTENT":
    case "QUOTA_SPLIT_INVALID":
    case "VACANCY_NOT_RECONCILED":
    // BRD G06 §9.4: DPC/roster/refusal domain failures are 409 CONFLICT.
    case "SENIORITY_LIST_NOT_FINAL":
    case "QUORUM_NOT_MET":
    case "PANEL_CONFLICT_OF_INTEREST":
    case "APAR_NOT_USABLE":
    case "OWN_MERIT_MIGRATION_REQUIRED":
    case "ROSTER_POINT_OCCUPIED":
    case "ROSTER_CATEGORY_MISMATCH":
    case "EMPLOYEE_DEBARRED":
    // BRD G05 §8.2: handover not accepted/under-protest and relieving before proof-of-service are 409 CONFLICT.
    case "ERR-G05-HANDOVER-DISPUTED":
    case "ERR-G05-NOT-SERVED":
    // BRD G08 §9: representation window elapsed (condonation required) is 409 CONFLICT.
    case "ERR-G08-REPWINDOW":
    // BRD G09 §10.3: due-process gate violations (Art. 311(1) competence, pending consultation,
    // DI-4 penalty enhancement, abated case, broken timeline chain, actor conflict) are 409 CONFLICT.
    case "ERR-G09-AUTHORITY-NOT-COMPETENT":
    case "ERR-G09-CONSULTATION-PENDING":
    case "ERR-G09-PENALTY-EXCEEDS-PROPOSED":
    case "ERR-G09-CASE-ABATED":
    case "ERR-G09-AUDIT-CHAIN-BROKEN":
    case "ERR-G09-ACTOR-CONFLICT":
    case "ERR-G09-DUE-PROCESS-INCOMPLETE":
    // BRD G10 FR-02: overlapping effective rate rows (VAL-G10-RATE-NONOVERLAP) are 409 CONFLICT.
    case "ERR-G10-RATE-OVERLAP":
    // BRD G10 §12: run/payslip lifecycle collisions are 409 CONFLICT — a second in-flight
    // FINAL run, a write to a locked run/payslip, a reopen after bank transmission, and a
    // recovery that would breach the protected net-pay floor (excess -> carryforward).
    case "ERR-G10-RUN-INFLIGHT":
    case "ERR-G10-RUN-IMMUTABLE":
    case "ERR-G10-REOPEN-BLOCKED":
    case "ERR-G10-RECOVERY-NET":
      return 409;
    case "ELIGIBILITY_FAILED":
    case "WINDOW_EXPIRED":
    // BRD G05 §8.2: deputation tenure cap and quarter retention beyond limit are 422 VALIDATION_FAILED.
    case "ERR-G05-DEPUTATION-CAP":
    case "ERR-G05-QUARTER-OVERSTAY":
    // BRD G08 §9: performance goal weightages != 100% at lock (VAL-WEIGHTAGE/WSUM) is 422.
    case "ERR-G08-WEIGHTAGE":
    // BRD G09 §10.3: subsistence rate outside template bounds (DI-8) and payment without NEC (DI-16) are 422.
    case "ERR-G09-SUBSISTENCE-OUT-OF-BOUNDS":
    case "ERR-G09-NON-EMPLOYMENT-CERT-REQUIRED":
    // BRD G10 §12: bad DSL expression (VAL-G10-DSL-TOKEN), as-of resolution miss, and missing
    // PT state-of-posting mapping are all 422.
    case "ERR-G10-RULE-EXPR":
    case "ERR-G10-RATE-NOTFOUND":
    case "ERR-G10-PT-STATE":
    // BRD G11 §12: rule-row/commutation-factor resolution misses are 422 (fail closed).
    case "ERR-G11-RULE-NOT-EFFECTIVE":
    case "ERR-G11-FACTOR-NOT-FOUND":
      return 422;
    case "PRECONDITION_FAILED":
    // BRD G06 §9.4: effecting blocked by an active interim stay is a 412 precondition failure.
    case "ENTITY_SUB_JUDICE":
      return 412;
    case "RATE_LIMITED":
      return 429;
    case "INTERNAL":
      return 500;
  }
}

export function publicError(error: unknown): { status: number; body: ErrorEnvelope } {
  const envelope = toPublicError(error);
  return {
    status: statusForError(envelope.error.code),
    body: envelope,
  };
}

export function unauthenticatedError(): FoundationError {
  return new FoundationError("UNAUTHENTICATED", "Authentication is required");
}
