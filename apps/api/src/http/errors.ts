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
    // BRD G13 §10.3: deny-by-default clearance gate miss (FR-006) and maker==checker
    // SoD violations on disposition/clearance approval (FR-009/FR-017) are 403.
    case "ERR-G13-CLEARANCE_INSUFFICIENT":
    case "ERR-G13-SOD_VIOLATION":
    // BRD G01 FR-EPM-015/018: maker == checker on a 4-eyes merge or separation approval is 403.
    case "SOD_VIOLATION":
    // BRD G03 FR-03: punches from unregistered/inactive devices fail closed as 403.
    case "DEVICE_NOT_AUTHORIZED":
    // BRD G14 §8.3: a below-k cohort read (FR-17 k-anonymity, incl. its complementary
    // suppression) and a maker==checker scope-policy activation (FR-04 AC7) are 403.
    case "ERR-G14-SMALL-CELL":
    case "ERR-G14-COMP-SUPPRESS":
    case "ERR-G14-SCOPE-CHECKER":
    // BRD G02 FR-018 AC1: self-service on any non-ACTIVE employment_status_at_submit is 403.
    case "ERR-G02-STATUSGATE":
    // BRD G02 FR-023: a HIGH/STATUTORY self-service submit without a completed step-up is 403.
    case "ERR-G02-STEPUP":
      return 403;
    case "NOT_FOUND":
    // BRD G14 FR-23: no snapshot known at the requested knowledge_time is 404.
    case "ERR-G14-ASOF-NA":
      return 404;
    case "CONFLICT":
    // BRD G01 FR-EPM-015/017/018 failure handling: conflicting-ACTIVE-state merge without
    // override, merge undo past the window, invalid §10.1 lifecycle transition (incl.
    // promote-active with gaps), archive under an ACTIVE legal hold, and separation with
    // open blocking obligations are all 409 CONFLICT.
    case "MERGE_CONFLICT":
    case "UNDO_EXPIRED":
    case "INVALID_STATE":
    case "LEGAL_HOLD_ACTIVE":
    case "BLOCKING_OBLIGATIONS":
    case "LEAVE_OVERLAP":
    // BRD G03 FR-01/FR-09: overlapping PUBLISHED rosters and comp-off over-balance are 409 CONFLICT.
    case "VAL-G03-ROSTER-OVERLAP":
    case "COMP_OFF_INSUFFICIENT":
    case "INSUFFICIENT_BALANCE":
    case "OPTIMISTIC_LOCK_CONFLICT":
    case "ENTITLEMENT_EXCEEDED":
    case "PERIOD_ALREADY_LOCKED":
    case "REGULARISATION_LIMIT":
    // BRD G03 FR-15/FR-16: closing an already-closed leave year, a close blocked by pending
    // leave, and an over-cap / non-encashable encashment are 409 CONFLICT.
    case "YEAR_ALREADY_CLOSED":
    case "PENDING_LEAVE_BLOCKS_CLOSE":
    case "ENCASHMENT_CAP_EXCEEDED":
    case "NOT_ENCASHABLE":
    // BRD G02 FR-015: applying/committing a change without a valid strong e-signature is 409.
    case "ERR-G02-ESIGN":
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
    // BRD G05 §8.2 (PH-16D, rules 5/6 + FR-019): allotment/join to a filled vacancy (incl. the
    // join-time transactional re-check), a counselling choice attempted out of turn, and
    // asymmetric mutual completion are 409 CONFLICT.
    case "ERR-G05-VACANCY-FULL":
    case "ERR-G05-COUNSEL-TURN":
    case "ERR-G05-MUTUAL-PAIR":
    // BRD G07 FR-018/020 (PH-16E): duplicate external credential reference per employee and
    // a BREACHED bond moved to RECOVERED without its BOND_RECOVERY cost are 409 CONFLICT.
    case "VAL-G07-CREDREF":
    case "VAL-G07-BOND":
    // BRD G08 §9: representation window elapsed (condonation required) is 409 CONFLICT.
    case "ERR-G08-REPWINDOW":
    // BRD G08 FR-09 (R1): applying an unratified calibration recommendation is 409 CONFLICT.
    case "ERR-G08-RATIFY":
    // BRD G09 §10.3: due-process gate violations (Art. 311(1) competence, pending consultation,
    // DI-4 penalty enhancement, abated case, broken timeline chain, actor conflict) are 409 CONFLICT.
    case "ERR-G09-AUTHORITY-NOT-COMPETENT":
    case "ERR-G09-CONSULTATION-PENDING":
    case "ERR-G09-PENALTY-EXCEEDS-PROPOSED":
    case "ERR-G09-CASE-ABATED":
    case "ERR-G09-AUDIT-CHAIN-BROKEN":
    case "ERR-G09-ACTOR-CONFLICT":
    case "ERR-G09-DUE-PROCESS-INCOMPLETE":
    // BRD G09 FR-023: POSH case without a validly composed ICC cannot proceed (fail closed).
    case "ERR-G09-ICC-PROCEDURE-REQUIRED":
    // BRD G09 FR-024: SLA resume without an open pause is 409 (edge case: "Resume before pause (rejected)").
    case "ERR-G09-SLA-PAUSE-INVALID":
    // BRD G10 FR-02: overlapping effective rate rows (VAL-G10-RATE-NONOVERLAP) are 409 CONFLICT.
    case "ERR-G10-RATE-OVERLAP":
    // BRD G10 §12: run/payslip lifecycle collisions are 409 CONFLICT — a second in-flight
    // FINAL run, a write to a locked run/payslip, a reopen after bank transmission, and a
    // recovery that would breach the protected net-pay floor (excess -> carryforward).
    case "ERR-G10-RUN-INFLIGHT":
    case "ERR-G10-RUN-IMMUTABLE":
    case "ERR-G10-REOPEN-BLOCKED":
    case "ERR-G10-RECOVERY-NET":
    // BRD G10 §12: control totals that do not tie out (incl. disbursed+held+failed),
    // approval/disbursement before reconciliation sign-off, and a legally-barred recovery
    // (FR-09 AC5) are 409 CONFLICT.
    case "ERR-G10-RECON-TIEOUT":
    case "ERR-G10-RECON-UNSIGNED":
    case "ERR-G10-RECOVERY-BARRED":
    // BRD G10 §12: mutation after snapshot/cutoff freeze (incl. tax-declaration mutation
    // after the FY proof cutoff, FR-07 AC3) is 409 CONFLICT.
    case "ERR-G10-SNAPSHOT-FROZEN":
    // BRD G11 FR-05/FR-22: cross-scheme benefit requests and DCRG release attempts while the
    // Rule 9 proceeding is still ACTIVE are 409 CONFLICT.
    case "ERR-G11-SCHEME-MISMATCH":
    case "ERR-G11-PROVISIONAL-PENDING":
    // BRD G11 §12: disbursement held for a lapsed life certificate (FR-12 AC1) and mutation
    // of an APPLIED revision batch (FR-13 AC4/P05) are 409 CONFLICT.
    case "ERR-G11-LC-SUSPENDED":
    case "ERR-G11-REVISION-IMMUTABLE":
    // BRD G13 error catalogue: document checked out by another user is 409 CONFLICT.
    case "ERR-G13-DOCUMENT_LOCKED":
    // BRD G13 §10.3 (R8): DPDP erasure overridden by statutory retention / legal hold / WORM.
    case "ERR-G13-ERASURE_EXEMPTED":
    // BRD G14 FR-02 AC7: cross-version KPI aggregation without acknowledgement is 409 CONFLICT.
    case "ERR-G14-XVER-AGG":
    // BRD G04 FR-02 AC3 (VAL-G04-MAPCOVER): overlapping PUBLISHED sr_event_mapping effective
    // ranges for the same (leave_type_code, event_type) are rejected at publish as 409.
    case "ERR-G04-MAPPING-OVERLAP":
      return 409;
    case "ELIGIBILITY_FAILED":
    case "WINDOW_EXPIRED":
    // BRD G03 FR-01/FR-03/FR-09: malformed shift timings, future-dated punches, and
    // redemption targeting an expired comp-off credit are 422 (fail closed).
    case "VAL-G03-SHIFT-TIMES":
    case "INVALID_PUNCH_TIME":
    case "COMP_OFF_EXPIRED":
    // BRD G05 §8.2: deputation tenure cap and quarter retention beyond limit are 422 VALIDATION_FAILED.
    case "ERR-G05-DEPUTATION-CAP":
    case "ERR-G05-QUARTER-OVERSTAY":
    // BRD G08 §9: performance goal weightages != 100% at lock (VAL-WEIGHTAGE/WSUM) is 422.
    case "ERR-G08-WEIGHTAGE":
    // BRD G09 §10.3: subsistence rate outside template bounds (DI-8) and payment without NEC (DI-16) are 422.
    case "ERR-G09-SUBSISTENCE-OUT-OF-BOUNDS":
    case "ERR-G09-NON-EMPLOYMENT-CERT-REQUIRED":
    // BRD G09 FR-025 (DI-29): "Deny without reason ⇒ 422 ERR-G09-PERSONAL-HEARING-DENIED".
    case "ERR-G09-PERSONAL-HEARING-DENIED":
    // BRD G06 FR-PPP-020: rota-quota input guards fail closed as 422.
    case "STREAM_TAG_MISSING":
    case "QUOTA_RULE_INVALID":
    // BRD G10 §12: bad DSL expression (VAL-G10-DSL-TOKEN), as-of resolution miss, and missing
    // PT state-of-posting mapping are all 422.
    case "ERR-G10-RULE-EXPR":
    case "ERR-G10-RATE-NOTFOUND":
    case "ERR-G10-PT-STATE":
    // BRD G10 FR-07: no TAX_SLAB rows for the regime/FY resolves 422 (fail closed).
    case "ERR-G10-TAXSLAB-NOTFOUND":
    // BRD G10 FR-21: a concessional perquisite with no effective reference-rate row is 422.
    case "ERR-G10-PERQ-REFRATE":
    // BRD G02 FR-015: an e-signature whose method is not permitted by policy is 422.
    case "ERR-G02-ESIGN-METHOD":
    // BRD G11 §12: rule-row/commutation-factor resolution misses are 422 (fail closed);
    // FR-06 AC1: an over-limit commuted fraction is 422, rejected — never clamped.
    case "ERR-G11-RULE-NOT-EFFECTIVE":
    case "ERR-G11-FACTOR-NOT-FOUND":
    case "ERR-G11-COMMUTATION-LIMIT":
    // BRD G11 FR-14: invalid destination account and a failed/absent pre-credit account
    // verification (IR16 fail-closed gate) are 422.
    case "ERR-G11-INVALID-ACCOUNT":
    case "ERR-G11-ACCOUNT-VERIFY":
    // BRD G13 §10.3: infected content (FR-007, quarantined) and a stored-bytes SHA-256
    // mismatch on fetch (FR-015, content withheld + quarantined) are 422.
    case "ERR-G13-MALWARE_DETECTED":
    case "ERR-G13-INTEGRITY_FAILED":
    // BRD G04 FR-02 AC6: a POST_SR mapping without its mandatory statutory_rule_ref citation
    // is rejected fail-closed; the registered validation id is the error code (422).
    case "VAL-G04-CITATION":
      return 422;
    case "PRECONDITION_FAILED":
    // BRD G06 §9.4: effecting blocked by an active interim stay is a 412 precondition failure.
    case "ENTITY_SUB_JUDICE":
    // BRD G02 FR-019 AC3: risk_band=BLOCKED holds commit pending fraud review (412).
    case "ERR-G02-RISKBLOCK":
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
