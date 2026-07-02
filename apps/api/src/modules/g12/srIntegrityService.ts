import { JobService, JobRun } from "../../jobs/jobService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope, sha256Hex, stableStringify } from "../../platform/types";
import {
  GENESIS_HASH,
  SrChainFailure,
  SrChainVerification,
  chainHeadLeaf,
  computeMerkleRoot,
  verifyEntryChain,
  verifyStatusChain,
} from "./srIntegrity";
import {
  SrAnchor,
  SrAttestation,
  SrAttestationKind,
  SrAttestationSubject,
  SrCertifiedExtract,
  SrExpectedEventRule,
  SrExtractRenderedEvent,
  SrExtractScope,
  SrGapRegisterEntry,
  SrGapStatus,
  SrIntegrityRepository,
  SrRedactionPolicy,
  SrRuleStatus,
  SrSeverity,
  SrSignatureMethod,
} from "./srIntegrityRepository";
import { ServiceRegisterService } from "./serviceRegisterService";

/** BRD job ids (X.1 scheduler registry) — registered by these literal ids in the job runner. */
export const JOB_G12_INTEGRITY = "JOB-G12-INTEGRITY";
export const JOB_G12_ANCHOR = "JOB-G12-ANCHOR";
export const JOB_G12_GAPSCAN = "JOB-G12-GAPSCAN";

/**
 * RFC 3161 Time-Stamp Authority seam (BRD G12 FR-04/FR-07). The external TSA call sits
 * behind this injectable interface; the Merkle computation itself is real and never
 * stubbed. Tests may inject a fake; production wires a licensed-CA client here.
 */
export interface TimestampAuthority {
  timestamp(digestHex: string): TsaTimestampResult;
}

export interface TsaTimestampResult {
  /** Opaque RFC 3161 timestamp token over the digest. */
  token: string;
  /** TSA identity / policy OID. */
  authority: string;
  timestampedAt: string;
}

/** Deterministic stub TimestampAuthority — a placeholder token, clearly marked non-qualified. */
export class StubTimestampAuthority implements TimestampAuthority {
  timestamp(digestHex: string): TsaTimestampResult {
    const timestampedAt = new Date().toISOString();
    return {
      token: `stub-tsa:${sha256Hex(`${digestHex}:${timestampedAt}`)}`,
      authority: "STUB-TSA (non-qualified; replace with licensed CA RFC 3161 endpoint)",
      timestampedAt,
    };
  }
}

/** FR-04 verify report for one employee: content chain + sr_status_events sub-chain. */
export interface SrIntegrityReport {
  employeeId: string;
  result: "OK" | "FAIL";
  entryChain: SrChainVerification;
  statusChain: SrChainVerification;
  /** First broken link across both chains (entry chain checked first). */
  firstFailure?: SrChainFailure;
}

export interface SrIntegrityJobResult {
  run: JobRun;
  employeesChecked: number;
  failures: SrIntegrityReport[];
  result: "OK" | "FAIL";
}

export interface SrAnchorJobResult {
  run: JobRun;
  anchor: SrAnchor;
}

export interface SrGapScanResult {
  run: JobRun;
  flagged: SrGapRegisterEntry[];
  employeesScanned: number;
  rulesEvaluated: number;
}

export interface SrGapScanWindow {
  periodFrom: string;
  periodTo: string;
}

/** Forward-only g12_gap_status lifecycle — rows are never deleted (FR-17). */
const GAP_TRANSITIONS: Record<SrGapStatus, SrGapStatus[]> = {
  GAP_FLAGGED: ["UNDER_REVIEW", "EXPLAINED", "CLOSED_RECORDED", "CLOSED_FALSE_POSITIVE"],
  UNDER_REVIEW: ["EXPLAINED", "CLOSED_RECORDED", "CLOSED_FALSE_POSITIVE"],
  EXPLAINED: ["CLOSED_RECORDED", "CLOSED_FALSE_POSITIVE"],
  CLOSED_RECORDED: [],
  CLOSED_FALSE_POSITIVE: [],
};

const OPEN_GAP_STATUSES: SrGapStatus[] = ["GAP_FLAGGED", "UNDER_REVIEW"];

/** Statutory attestation kinds for which SERVER_SIGNED is banned (BRD G12 §5.6 r.11). */
const STATUTORY_ATTESTATION_KINDS: SrAttestationKind[] = ["CUSTODIAN_ATTEST", "EXTRACT_SIGN"];

/**
 * Purpose-driven redaction (FR-10): event categories excluded from the rendering per
 * policy. Categories are event type codes at this substrate depth.
 */
const REDACTION_POLICY_EXCLUDED_CATEGORIES: Record<SrRedactionPolicy, string[]> = {
  NONE: [],
  LOAN_EXCLUDE_DISCIPLINARY: ["PUNISHMENT", "SUSPENSION", "PENALTY", "DISCIPLINARY_ACTION"],
  PUBLIC_MINIMAL: ["PUNISHMENT", "SUSPENSION", "PENALTY", "DISCIPLINARY_ACTION", "PAY_REVISION", "INCREMENT"],
  PENSION_FULL: [],
  COURT_FULL: [],
};

const VALID_SEVERITIES: SrSeverity[] = ["INFO", "WARN", "CRITICAL"];
const VALID_RULE_STATUSES: SrRuleStatus[] = ["DRAFT", "PUBLISHED", "RETIRED"];

export interface SrExpectedEventRuleInput {
  ruleCode: string;
  expectedEventCategory: string;
  cadence?: Record<string, unknown>;
  suppressedByCategories?: string[];
  appliesToCadre?: string[];
  sourceRuleRef?: string;
  severity?: SrSeverity;
  status?: SrRuleStatus;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface SrAttestationInput {
  employeeId: string;
  attestationKind: SrAttestationKind;
  attestedRole: string;
  signatureMethod: SrSignatureMethod;
  certificateSerial?: string;
  subjectType?: SrAttestationSubject;
  subjectId?: string;
}

export interface SrCertifiedExtractInput {
  employeeId: string;
  scope?: SrExtractScope;
  redactionPolicy?: SrRedactionPolicy;
  issuedTo: string;
  purpose?: string;
  periodFrom?: string;
  periodTo?: string;
}

/**
 * PH-10B G12 integrity pillars on the PH-10A SHA-256 substrate (BRD G12 FR-04/07/10/17):
 * chain verification (endpoint + JOB-G12-INTEGRITY on the same code path), real
 * Merkle-root anchoring behind the RFC 3161 TSA seam (JOB-G12-ANCHOR, E20), the
 * completeness gap register (JOB-G12-GAPSCAN, E21/E22), custodian attestations (E11),
 * and purpose-redacted certified extracts (E14, P02 field mask fail-closed).
 */
export class SrIntegrityService {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly serviceRegister: ServiceRegisterService,
    private readonly jobs: JobService,
    private readonly repository: SrIntegrityRepository,
    private readonly tsa: TimestampAuthority = new StubTimestampAuthority()
  ) {}

  // -------------------------------------------------------------------------------------
  // FR-04: ledger integrity verify — endpoint and JOB-G12-INTEGRITY share this code path.
  // -------------------------------------------------------------------------------------

  /**
   * Walk one employee's content chain and sr_status_events sub-chain, RECOMPUTING every
   * hash from stored content (never comparing stored hash to stored hash), and report
   * OK/FAIL with the first broken link.
   */
  verifyEmployee(scope: TenantScope, employeeId: string): SrIntegrityReport {
    requireTenantScope(scope);
    const entryChain = verifyEntryChain(this.serviceRegister.getEntryChain(scope, employeeId));
    const statusChain = verifyStatusChain(this.serviceRegister.getStatusChain(scope, employeeId));
    const firstFailure = entryChain.firstFailure ?? statusChain.firstFailure;
    return {
      employeeId,
      result: firstFailure ? "FAIL" : "OK",
      entryChain,
      statusChain,
      firstFailure,
    };
  }

  /** JOB-G12-INTEGRITY: scheduled rolling recompute over every employee chain (same verify path). */
  runIntegrityJob(scope: TenantScope, runKey: string): SrIntegrityJobResult {
    requireTenantScope(scope);
    const run = this.jobs.start(scope, { jobId: JOB_G12_INTEGRITY, runKey });
    const employees = this.serviceRegister.listChainEmployees(scope);
    const failures: SrIntegrityReport[] = [];
    for (const employeeId of employees) {
      const report = this.verifyEmployee(scope, employeeId);
      if (report.result === "FAIL") {
        failures.push(report);
      }
    }
    const result: "OK" | "FAIL" = failures.length === 0 ? "OK" : "FAIL";
    const finished = this.jobs.finish(scope, run.id, {
      rowsAffected: employees.length,
      outcomeDetail: { jobId: JOB_G12_INTEGRITY, result, failures: failures.map((item) => ({ employeeId: item.employeeId, firstFailure: item.firstFailure })) },
    });
    this.audit.recordMutation(scope, {
      action: "G12_INTEGRITY_VERIFY_RUN",
      subjectRef: `job_runs:${finished.id}`,
      metadata: { jobId: JOB_G12_INTEGRITY, employeesChecked: employees.length, result },
    });
    return { run: finished, employeesChecked: employees.length, failures, result };
  }

  // -------------------------------------------------------------------------------------
  // FR-04: E20 sr_anchors — REAL Merkle root over per-employee chain heads, TSA behind seam.
  // -------------------------------------------------------------------------------------

  /** JOB-G12-ANCHOR: compute + persist one Merkle anchor over all per-employee chain heads. */
  runAnchorJob(scope: TenantScope, runKey: string, window?: { periodFrom?: string; periodTo?: string }): SrAnchorJobResult {
    requireTenantScope(scope);
    const run = this.jobs.start(scope, { jobId: JOB_G12_ANCHOR, runKey });
    const employees = this.serviceRegister.listChainEmployees(scope);
    const heads = employees.map((employeeId) => {
      const entries = this.serviceRegister.getEntryChain(scope, employeeId);
      const statuses = this.serviceRegister.getStatusChain(scope, employeeId);
      return {
        employeeId,
        entryHeadHash: entries[entries.length - 1]?.entryHash ?? GENESIS_HASH,
        statusHeadHash: statuses[statuses.length - 1]?.statusHash ?? GENESIS_HASH,
      };
    });
    const leaves = heads.map(chainHeadLeaf);
    const merkleRoot = computeMerkleRoot(leaves);
    const headSnapshotDigest = sha256Hex(stableStringify([...leaves].sort()));
    const tsaResult = this.tsa.timestamp(merkleRoot);
    const previous = this.repository.latestAnchor(scope);
    const createdAt = new Date().toISOString();
    const anchorWithoutHash = {
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      anchorSeq: (previous?.anchorSeq ?? 0) + 1,
      periodFrom: window?.periodFrom ?? previous?.periodTo ?? createdAt,
      periodTo: window?.periodTo ?? createdAt,
      merkleRoot,
      leafCount: leaves.length,
      headSnapshotDigest,
      tsaTimestampToken: tsaResult.token,
      tsaAuthority: tsaResult.authority,
      prevAnchorHash: previous?.anchorHash ?? GENESIS_HASH,
      createdAt,
    };
    const anchor: SrAnchor = {
      id: nextId("sr-anchor", this.repository.countAnchors()),
      ...anchorWithoutHash,
      anchorHash: sha256Hex(stableStringify(anchorWithoutHash)),
    };
    this.repository.appendAnchor(anchor);
    const finished = this.jobs.finish(scope, run.id, {
      rowsAffected: 1,
      outcomeDetail: { jobId: JOB_G12_ANCHOR, anchorId: anchor.id, merkleRoot, leafCount: anchor.leafCount },
    });
    this.audit.recordMutation(scope, {
      action: "G12_ANCHOR_APPEND",
      subjectRef: `sr_anchors:${anchor.id}`,
      metadata: { jobId: JOB_G12_ANCHOR, anchorSeq: anchor.anchorSeq, leafCount: anchor.leafCount },
    });
    return { run: finished, anchor };
  }

  listAnchors(scope: TenantScope): SrAnchor[] {
    requireTenantScope(scope);
    return this.repository.listAnchors(scope);
  }

  // -------------------------------------------------------------------------------------
  // FR-17: E21 sr_expected_event_rule + E22 sr_gap_register via JOB-G12-GAPSCAN.
  // -------------------------------------------------------------------------------------

  createExpectedEventRule(scope: TenantScope, input: SrExpectedEventRuleInput): SrExpectedEventRule {
    requireTenantScope(scope);
    if (!input.ruleCode || !input.expectedEventCategory || !input.effectiveFrom) {
      throw new FoundationError("VALIDATION_FAILED", "ruleCode, expectedEventCategory and effectiveFrom are required");
    }
    const severity = input.severity ?? "WARN";
    const status = input.status ?? "DRAFT";
    if (!VALID_SEVERITIES.includes(severity)) {
      throw new FoundationError("VALIDATION_FAILED", "Unsupported severity", { field: "severity" });
    }
    if (!VALID_RULE_STATUSES.includes(status)) {
      throw new FoundationError("VALIDATION_FAILED", "Unsupported rule status", { field: "status" });
    }
    const rule: SrExpectedEventRule = {
      id: nextId("sr-exp-rule", this.repository.countExpectedEventRules()),
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      ruleCode: input.ruleCode,
      appliesToCadre: input.appliesToCadre,
      expectedEventCategory: input.expectedEventCategory,
      cadence: input.cadence ?? { frequency: "ANNUAL" },
      suppressedByCategories: input.suppressedByCategories ?? [],
      sourceRuleRef: input.sourceRuleRef,
      severity,
      status,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
    };
    this.repository.saveExpectedEventRule(rule);
    this.audit.recordMutation(scope, { action: "G12_EXPECTED_EVENT_RULE_CREATE", subjectRef: `sr_expected_event_rule:${rule.id}`, metadata: { ruleCode: rule.ruleCode } });
    return rule;
  }

  /**
   * JOB-G12-GAPSCAN: reconcile PUBLISHED expected-event rules against recorded events for
   * the scan window; a missing expected event with no legitimate suppressor APPENDS an
   * sr_gap_register row with status GAP_FLAGGED. Existing open gaps for the same
   * (rule, employee, window) are not duplicated; gaps are never deleted.
   */
  runGapScan(scope: TenantScope, runKey: string, window: SrGapScanWindow): SrGapScanResult {
    requireTenantScope(scope);
    if (!window?.periodFrom || !window?.periodTo || window.periodTo < window.periodFrom) {
      throw new FoundationError("VALIDATION_FAILED", "Gap scan requires a valid periodFrom/periodTo window");
    }
    const run = this.jobs.start(scope, { jobId: JOB_G12_GAPSCAN, runKey });
    const rules = this.repository
      .listExpectedEventRules(scope)
      .filter((rule) => rule.status === "PUBLISHED" && rule.effectiveFrom <= window.periodTo && (!rule.effectiveTo || rule.effectiveTo >= window.periodFrom));
    const employees = this.serviceRegister.listChainEmployees(scope);
    const flagged: SrGapRegisterEntry[] = [];
    for (const rule of rules) {
      for (const employeeId of employees) {
        const chain = this.serviceRegister.getEntryChain(scope, employeeId);
        const inWindow = chain.filter((event) => event.eventDate >= window.periodFrom && event.eventDate <= window.periodTo);
        const recorded = inWindow.some((event) => event.eventTypeCode === rule.expectedEventCategory);
        const suppressed = inWindow.some((event) => rule.suppressedByCategories.includes(event.eventTypeCode));
        if (recorded || suppressed) {
          continue;
        }
        const duplicate = this.repository
          .listGaps(scope, employeeId)
          .some(
            (gap) =>
              gap.ruleId === rule.id &&
              gap.expectedPeriodFrom === window.periodFrom &&
              gap.expectedPeriodTo === window.periodTo &&
              OPEN_GAP_STATUSES.includes(gap.gapStatus)
          );
        if (duplicate) {
          continue;
        }
        const gap: SrGapRegisterEntry = {
          id: nextId("sr-gap", this.repository.countGaps()),
          tenantId: scope.tenantId,
          entityId: scope.entityId,
          employeeId,
          ruleId: rule.id,
          expectedPeriodFrom: window.periodFrom,
          expectedPeriodTo: window.periodTo,
          expectedEventCategory: rule.expectedEventCategory,
          gapStatus: "GAP_FLAGGED",
          severity: rule.severity,
          detectedAt: new Date().toISOString(),
        };
        this.repository.appendGap(gap);
        flagged.push(gap);
      }
    }
    const finished = this.jobs.finish(scope, run.id, {
      rowsAffected: flagged.length,
      outcomeDetail: { jobId: JOB_G12_GAPSCAN, window, rulesEvaluated: rules.length, employeesScanned: employees.length, flagged: flagged.length },
    });
    this.audit.recordMutation(scope, {
      action: "G12_GAPSCAN_RUN",
      subjectRef: `job_runs:${finished.id}`,
      metadata: { jobId: JOB_G12_GAPSCAN, flagged: flagged.length },
    });
    return { run: finished, flagged, employeesScanned: employees.length, rulesEvaluated: rules.length };
  }

  listGaps(scope: TenantScope, employeeId?: string): SrGapRegisterEntry[] {
    requireTenantScope(scope);
    return this.repository.listGaps(scope, employeeId);
  }

  /**
   * Move a gap forward through the BRD lifecycle (GAP_FLAGGED → UNDER_REVIEW → EXPLAINED /
   * CLOSED_RECORDED / CLOSED_FALSE_POSITIVE). Explanations transition status; rows are
   * never deleted.
   */
  resolveGap(
    scope: TenantScope,
    gapId: string,
    input: { gapStatus: SrGapStatus; explanationCode?: string; resolvedEventId?: string; corroboratedBy?: string }
  ): SrGapRegisterEntry {
    requireTenantScope(scope);
    const gap = this.repository.findGap(scope, gapId);
    if (!gap) {
      throw new FoundationError("NOT_FOUND", "Gap register entry not found");
    }
    if (!GAP_TRANSITIONS[gap.gapStatus].includes(input.gapStatus)) {
      throw new FoundationError("CONFLICT", "Gap status transition not allowed", {
        details: { from: gap.gapStatus, to: input.gapStatus },
      });
    }
    if (input.gapStatus === "EXPLAINED" && !input.explanationCode) {
      throw new FoundationError("VALIDATION_FAILED", "EXPLAINED requires an explanationCode", { field: "explanationCode" });
    }
    if (input.gapStatus === "CLOSED_RECORDED") {
      if (!input.resolvedEventId || !this.serviceRegister.getEvent(scope, input.resolvedEventId)) {
        throw new FoundationError("VALIDATION_FAILED", "CLOSED_RECORDED requires an existing resolvedEventId", { field: "resolvedEventId" });
      }
    }
    const closed = input.gapStatus === "CLOSED_RECORDED" || input.gapStatus === "CLOSED_FALSE_POSITIVE";
    const updated: SrGapRegisterEntry = {
      ...gap,
      gapStatus: input.gapStatus,
      explanationCode: input.explanationCode ?? gap.explanationCode,
      resolvedEventId: input.resolvedEventId ?? gap.resolvedEventId,
      corroboratedBy: input.corroboratedBy ?? gap.corroboratedBy,
      closedAt: closed ? new Date().toISOString() : gap.closedAt,
    };
    this.repository.updateGap(updated);
    this.audit.recordMutation(scope, {
      action: "G12_GAP_STATUS_CHANGE",
      subjectRef: `sr_gap_register:${gap.id}`,
      metadata: { from: gap.gapStatus, to: input.gapStatus, explanationCode: input.explanationCode },
    });
    return updated;
  }

  // -------------------------------------------------------------------------------------
  // FR-07: E11 sr_attestations — custodian attestation over a chain head.
  // -------------------------------------------------------------------------------------

  /** Record a custodian/employee attestation whose signed digest is the current entry-chain head. */
  attestChainHead(scope: TenantScope, input: SrAttestationInput): SrAttestation {
    requireTenantScope(scope);
    if (STATUTORY_ATTESTATION_KINDS.includes(input.attestationKind) && input.signatureMethod === "SERVER_SIGNED") {
      // BRD G12 §5.6 r.11: server-signed statutory outputs are banned.
      throw new FoundationError("VALIDATION_FAILED", "SERVER_SIGNED is not permitted for statutory attestations", { field: "signatureMethod" });
    }
    const chain = this.serviceRegister.getEntryChain(scope, input.employeeId);
    const head = chain[chain.length - 1];
    if (!head) {
      throw new FoundationError("NOT_FOUND", "Employee has no service register chain to attest");
    }
    const signedDigest = input.subjectType === "EVENT" && input.subjectId ? this.requireEventHash(scope, input.subjectId) : head.entryHash;
    const tsaResult = this.tsa.timestamp(signedDigest);
    const attestation: SrAttestation = {
      id: nextId("sr-attest", this.repository.countAttestations()),
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      // Chain-head attestation targets the head EVENT (frozen g12_attestation_subject enum).
      subjectType: input.subjectType ?? "EVENT",
      subjectId: input.subjectId ?? head.id,
      employeeId: input.employeeId,
      attestationKind: input.attestationKind,
      attestedBy: scope.actorUserId ?? "system",
      attestedRole: input.attestedRole,
      signatureMethod: input.signatureMethod,
      certificateSerial: input.certificateSerial,
      tsaTimestampToken: tsaResult.token,
      tsaAuthority: tsaResult.authority,
      signedDigest,
      attestedAt: new Date().toISOString(),
    };
    this.repository.appendAttestation(attestation);
    this.audit.recordMutation(scope, {
      action: "G12_ATTESTATION_APPEND",
      subjectRef: `sr_attestations:${attestation.id}`,
      metadata: { attestationKind: attestation.attestationKind, signatureMethod: attestation.signatureMethod },
    });
    return attestation;
  }

  listAttestations(scope: TenantScope, employeeId: string): SrAttestation[] {
    requireTenantScope(scope);
    return this.repository.listAttestations(scope, employeeId);
  }

  getAttestation(scope: TenantScope, attestationId: string): SrAttestation | undefined {
    requireTenantScope(scope);
    return this.repository.findAttestation(scope, attestationId);
  }

  // -------------------------------------------------------------------------------------
  // FR-10: E14 sr_certified_extracts — P02-redacted certified rendering.
  // -------------------------------------------------------------------------------------

  /**
   * Issue a certified extract: snapshot the redacted rendering (purpose-policy category
   * exclusion + P02 field mask, FAIL-CLOSED for ungranted fields), bind it with a content
   * digest, and pin the entry/status chain heads it certifies.
   */
  issueCertifiedExtract(actor: ActorContext, scope: TenantScope, input: SrCertifiedExtractInput): SrCertifiedExtract {
    requireTenantScope(scope);
    const extractScope = input.scope ?? "FULL_SR";
    const redactionPolicy = input.redactionPolicy ?? "NONE";
    const excludedCategories = REDACTION_POLICY_EXCLUDED_CATEGORIES[redactionPolicy];
    if (!excludedCategories) {
      throw new FoundationError("VALIDATION_FAILED", "Unsupported redaction policy", { field: "redactionPolicy" });
    }
    if (!input.issuedTo) {
      throw new FoundationError("VALIDATION_FAILED", "issuedTo is required", { field: "issuedTo" });
    }
    const chain = this.serviceRegister.getTimeline(scope, input.employeeId);
    const chainHead = chain[chain.length - 1];
    if (!chainHead) {
      throw new FoundationError("NOT_FOUND", "Employee has no service register entries to extract");
    }
    const statusChain = this.serviceRegister.getStatusChain(scope, input.employeeId);
    const windowed =
      extractScope === "DATE_RANGE" && input.periodFrom && input.periodTo
        ? chain.filter((event) => event.eventDate >= (input.periodFrom as string) && event.eventDate <= (input.periodTo as string))
        : chain;
    const kept = windowed.filter((event) => !excludedCategories.includes(event.eventTypeCode));
    const redactedCategories = [...new Set(windowed.filter((event) => excludedCategories.includes(event.eventTypeCode)).map((event) => event.eventTypeCode))];
    const redactedFields = new Set<string>();
    const renderedEvents: SrExtractRenderedEvent[] = kept.map((event) => {
      const payload: Record<string, unknown> = {};
      for (const key of Object.keys(event.payload)) {
        // P02 field mask on serialization, fail-closed: a field renders only with an
        // explicit grant (sr.payload.<field> or *); everything else is redacted.
        if (this.authorization.canSeeField(actor, `sr.payload.${key}`)) {
          payload[key] = event.payload[key];
        } else {
          payload[key] = "[REDACTED]";
          redactedFields.add(key);
        }
      }
      return {
        sequenceNo: event.sequenceNo,
        eventTypeCode: event.eventTypeCode,
        eventDate: event.eventDate,
        entryHash: event.entryHash,
        status: event.status,
        payload,
      };
    });
    const contentDigest = sha256Hex(stableStringify(renderedEvents));
    const extractNo = `SR-EXT-${String(this.repository.countExtracts() + 1).padStart(6, "0")}`;
    const latestAnchor = this.repository.latestAnchor(scope);
    const extract: SrCertifiedExtract = {
      id: nextId("sr-extract", this.repository.countExtracts()),
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      extractNo,
      employeeId: input.employeeId,
      scope: extractScope,
      scopeParams: extractScope === "DATE_RANGE" ? { periodFrom: input.periodFrom, periodTo: input.periodTo } : undefined,
      eventCount: renderedEvents.length,
      contentDigest,
      redactionPolicy,
      redactedCategories,
      redactedFields: [...redactedFields].sort(),
      chainHeadHash: chainHead.entryHash,
      statusChainHeadHash: statusChain[statusChain.length - 1]?.statusHash ?? GENESIS_HASH,
      anchorId: latestAnchor?.id,
      qrVerificationToken: sha256Hex(`${extractNo}:${contentDigest}`),
      issuedTo: input.issuedTo,
      purpose: input.purpose,
      revoked: false,
      issuedAt: new Date().toISOString(),
      renderedEvents,
    };
    this.repository.appendExtract(extract);
    this.audit.recordMutation(scope, {
      action: "G12_CERTIFIED_EXTRACT_ISSUE",
      subjectRef: `sr_certified_extracts:${extract.id}`,
      metadata: { redactionPolicy, eventCount: extract.eventCount, redactedFieldCount: extract.redactedFields.length },
    });
    return extract;
  }

  getExtract(scope: TenantScope, extractId: string): SrCertifiedExtract | undefined {
    requireTenantScope(scope);
    return this.repository.findExtract(scope, extractId);
  }

  private requireEventHash(scope: TenantScope, eventId: string): string {
    const event = this.serviceRegister.getEvent(scope, eventId);
    if (!event) {
      throw new FoundationError("NOT_FOUND", "SR event not found");
    }
    return event.entryHash;
  }
}
