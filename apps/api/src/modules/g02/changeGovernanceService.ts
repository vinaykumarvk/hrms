import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { HrmsWorkflowService } from "../../platform/workflow/hrmsWorkflowService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";
import { EmployeeMasterService, EmployeeRecord } from "../g01/employeeMasterService";
import {
  FieldSensitivityCatalogEntry,
  G02FieldGroup,
  PersonalDetailsRepository,
  resolveApprovalRule,
} from "./personalDetailsRepository";
import {
  BulkCorrectionBatch,
  BulkCorrectionRow,
  BulkRowCommitResult,
  BulkRowValidation,
  ChangeGovernanceRepository,
  CrRiskSignal,
  G02ElevatedPath,
  G02RiskBand,
  G02RiskReviewOutcome,
  GovernedChangeOrigin,
  G02GovernedChangeRequest,
} from "./changeGovernanceRepository";

/**
 * PH-16B G02 change governance at BRD depth:
 *   - FR-G02-009 bulk HR corrections: staged bulk_correction_batches (E12) with dry-run
 *     validation, aggregate P01 approval honoring the highest sensitivity in the batch, and
 *     per-row idempotent commit with per-row failures -> COMMITTED / PARTIAL_FAILED;
 *   - FR-G02-019 risk engine: DUPLICATE_BANK_ACCOUNT (mule) and AUTH_CHANNEL_THEN_FINANCIAL
 *     detectors appending to the cr_risk_signals ledger (E13, INSERT-only), aggregated into
 *     risk_score (0-100) / risk_band; BLOCKED holds commit (412 ERR-G02-RISKBLOCK) until a
 *     Fraud Reviewer distinct from the requester clears the signal — a confirmed signal keeps
 *     the request blocked and rejects it (BR2);
 *   - FR-G02-018 status gate: employment_status_at_submit snapshot; self-service on any
 *     non-ACTIVE target fails closed (403 ERR-G02-STATUSGATE); bank/nominee changes on a
 *     DECEASED record route to the elevated family-pension path with dual control (BR2 —
 *     never auto-apply); other non-ACTIVE HR changes route STATUS_ELEVATED with dual control.
 *
 * Field sensitivity/grouping and approval routing come from the PH-07C config entities
 * (field_sensitivity_catalog + ACTIVE approval_matrix_config) — never hardcoded here.
 */

/** BRD FR-G02-018 AC3 / FR-G02-019 AC4: bank-account and nominee field keys of the catalog. */
const BANK_ACCOUNT_FIELD_KEYS = ["bankAccountNumber"];
const NOMINEE_FIELD_KEYS = ["nomineeName"];
/** FR-G02-019 AC5 (R1): auth-bearing contact channels — OTP/notification carriers. */
const AUTH_CHANNEL_FIELD_KEYS = ["mobileNumber", "email"];

/**
 * Detector contributions to the 0-100 score. DUPLICATE_BANK_ACCOUNT is severity BLOCK — a
 * suspected mule account fails closed until a Fraud Reviewer decides (FR-G02-019 AC3/AC4).
 * AUTH_CHANNEL_THEN_FINANCIAL is severity HIGH — it forces the fraud-review stage (AC5).
 */
const DUPLICATE_BANK_SCORE = 70;
const AUTH_THEN_FINANCIAL_SCORE = 40;

/**
 * The remaining FR-G02-019 detectors (PRE_PAYROLL_CUTOFF, PRE_SEPARATION_WINDOW,
 * DEVICE_VELOCITY, MULTI_EMPLOYEE_SAME_DEVICE, OFF_HOURS_BURST) need payroll-cutoff /
 * separation-window policy values that have no grounded source in the BRD or module config —
 * recorded as config-gapped (BR1: thresholds are System-Admin configuration), not invented.
 */
export const configGappedDetectors = [
  "PRE_PAYROLL_CUTOFF",
  "PRE_SEPARATION_WINDOW",
  "DEVICE_VELOCITY",
  "MULTI_EMPLOYEE_SAME_DEVICE",
  "OFF_HOURS_BURST",
] as const;

export interface ChangeGovernanceOptions {
  /** BR1 configurable window for the mule detector (same account across employees). */
  duplicateBankWindowDays?: number;
  /** BR1 configurable window for auth-channel-change-then-financial-change chaining. */
  authThenFinancialWindowDays?: number;
}

export interface GovernedChangeSubmitInput {
  employeeId: string;
  fieldKey: string;
  newValue: string;
  reason: string;
  origin: GovernedChangeOrigin;
  changeType?: "UPDATE" | "CORRECTION";
}

export interface BulkValidationReport {
  batchId: string;
  status: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: BulkRowValidation[];
}

export interface RiskView {
  changeRequestId: string;
  riskScore: number;
  riskBand: G02RiskBand;
  fraudReviewRequired: boolean;
  signals: CrRiskSignal[];
}

export class ChangeGovernanceService {
  private readonly duplicateBankWindowDays: number;
  private readonly authThenFinancialWindowDays: number;

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly workflow: HrmsWorkflowService,
    private readonly notifications: NotificationService,
    private readonly catalogRepository: PersonalDetailsRepository,
    private readonly repository: ChangeGovernanceRepository,
    options: ChangeGovernanceOptions = {}
  ) {
    this.duplicateBankWindowDays = options.duplicateBankWindowDays ?? 90;
    this.authThenFinancialWindowDays = options.authThenFinancialWindowDays ?? 7;
  }

  // =====================================================================================
  // FR-G02-018 + FR-G02-019 — governed single change with status gate and risk evaluation
  // =====================================================================================

  submitChange(actor: ActorContext, input: GovernedChangeSubmitInput): G02GovernedChangeRequest {
    this.authorization.check(actor, "g02.change.submit", actor);
    const request = this.materializeRequest(actor, input, undefined);
    this.audit.recordMutation(actor, {
      action: "G02_GOVERNED_CHANGE_SUBMIT",
      subjectRef: `change_requests:${request.id}`,
      // No field values in audit metadata: bank/contact values are PII.
      metadata: {
        fieldKey: request.fieldKey,
        sensitivity: request.sensitivity,
        origin: request.requestOrigin,
        employmentStatusAtSubmit: request.employmentStatusAtSubmit,
        elevatedPath: request.elevatedPath,
        riskBand: request.riskBand,
      },
    });
    return request;
  }

  /**
   * FR-G02-004-style decision with FR-G02-018 dual control: SoD (approver != requester and
   * not a repeat approver); FAMILY_PENSION / STATUS_ELEVATED requests only reach APPROVED
   * once the second distinct authority sanctions — never auto-applied (BR2).
   */
  approveChange(actor: ActorContext, requestId: string): G02GovernedChangeRequest {
    this.authorization.check(actor, "g02.change.approve", actor);
    const request = this.requireRequest(actor, requestId);
    if (request.status !== "SUBMITTED" && request.status !== "IN_REVIEW") {
      throw new FoundationError("PRECONDITION_FAILED", "Only pending governed change requests can be approved");
    }
    if (actor.userId === request.requestedBy) {
      throw new FoundationError("FORBIDDEN", "Separation of duties: the requester cannot approve the change", {
        details: { messageId: "ERR-G02-SOD", elevatedPath: request.elevatedPath },
      });
    }
    if (request.approvedBy.includes(actor.userId)) {
      throw new FoundationError("FORBIDDEN", "Dual control requires two distinct approvers", {
        details: { rule: "VAL-G02-DUALAUTH", elevatedPath: request.elevatedPath },
      });
    }
    request.approvedBy = [...request.approvedBy, actor.userId];
    if (request.approvedBy.length >= request.requiredApprovals) {
      this.workflow.actOnInstance(actor, { instanceId: request.workflowInstanceId, action: "APPROVE" });
      request.status = "APPROVED";
    } else {
      // First of two sanctions on an elevated path: stays pending the second authority.
      request.status = "IN_REVIEW";
    }
    this.repository.updateRequest(request);
    this.audit.recordMutation(actor, {
      action: "G02_GOVERNED_CHANGE_APPROVE",
      subjectRef: `change_requests:${request.id}`,
      metadata: { approvals: request.approvedBy.length, requiredApprovals: request.requiredApprovals, status: request.status },
    });
    return this.requireRequest(actor, requestId);
  }

  /**
   * FR-G02-019 AC3 commit gate: any commit attempt while risk_band=BLOCKED fails closed with
   * 412 ERR-G02-RISKBLOCK until a Fraud Reviewer clears the blocking signal. Replaying a
   * committed request with its idempotency key is a no-op (FR-G02-010 AC1).
   */
  commitChange(actor: ActorContext, requestId: string, idempotencyKey: string): G02GovernedChangeRequest {
    this.authorization.check(actor, "g02.change.commit", actor);
    const request = this.requireRequest(actor, requestId);
    if (request.status === "COMMITTED" && request.commitIdempotencyKey === idempotencyKey) {
      return request; // idempotent replay: no-op
    }
    this.commitRequestRow(actor, request, idempotencyKey);
    return this.requireRequest(actor, requestId);
  }

  getRisk(scope: TenantScope, requestId: string): RiskView {
    requireTenantScope(scope);
    const request = this.requireRequest(scope, requestId);
    return {
      changeRequestId: request.id,
      riskScore: request.riskScore,
      riskBand: request.riskBand,
      fraudReviewRequired: request.fraudReviewRequired,
      signals: this.repository.listRiskSignals(scope, request.id),
    };
  }

  /** FR-G02-019 AC6 fraud-review queue: requests carrying a HIGH or BLOCKED band. */
  listFraudQueue(scope: TenantScope): G02GovernedChangeRequest[] {
    requireTenantScope(scope);
    return this.repository.listRequests(scope).filter((item) => item.riskBand === "HIGH" || item.riskBand === "BLOCKED");
  }

  /**
   * FR-G02-019 AC6 reviewer decision. The reviewer must be a principal distinct from the
   * requester (fail-closed SoD). CLEARED removes the signal's contribution and re-aggregates
   * the band; CONFIRMED_FRAUD rejects the request (BR2) and keeps it blocked; ESCALATED
   * keeps the block and leaves the request pending a higher authority.
   */
  reviewRiskSignal(
    actor: ActorContext,
    requestId: string,
    signalId: string,
    input: { outcome: G02RiskReviewOutcome; comment: string | undefined }
  ): { signal: CrRiskSignal; request: G02GovernedChangeRequest } {
    this.authorization.check(actor, "g02.risk.review", actor);
    const request = this.requireRequest(actor, requestId);
    if (actor.userId === request.requestedBy) {
      throw new FoundationError("FORBIDDEN", "Fraud review requires a principal distinct from the requester", {
        details: { rule: "FR-G02-019 AC6", requestedBy: request.requestedBy },
      });
    }
    const comment = input.comment?.trim();
    if (!comment) {
      throw new FoundationError("VALIDATION_FAILED", "A review comment is mandatory when clearing or confirming a risk signal", {
        field: "comment",
        details: { messageId: "ERR-REASON-REQ" },
      });
    }
    const signal = this.repository.recordRiskSignalReview(actor, signalId, {
      reviewedBy: actor.userId,
      reviewOutcome: input.outcome,
      reviewComment: comment,
    });
    if (input.outcome === "CONFIRMED_FRAUD") {
      // BR2: a confirmed signal rejects the request; the block is never lifted.
      request.status = "REJECTED";
    }
    this.reaggregateRisk(actor, request);
    this.audit.recordMutation(actor, {
      action: "G02_RISK_SIGNAL_REVIEW",
      subjectRef: `cr_risk_signals:${signal.id}`,
      metadata: { changeRequestId: request.id, outcome: input.outcome, riskBand: request.riskBand },
    });
    return { signal, request: this.requireRequest(actor, requestId) };
  }

  // =====================================================================================
  // FR-G02-009 — bulk HR-initiated corrections
  // =====================================================================================

  /** BR1: bulk is HR-only (permission-gated); rows are staged as an UPLOADED batch. */
  createBatch(actor: ActorContext, input: { rows: Array<Omit<BulkCorrectionRow, "rowNo">>; reason?: string }): BulkCorrectionBatch {
    this.authorization.check(actor, "g02.bulk.manage", actor);
    if (!Array.isArray(input.rows) || input.rows.length === 0) {
      throw new FoundationError("VALIDATION_FAILED", "A bulk correction batch requires at least one row", { field: "rows" });
    }
    const count = this.repository.countBatches();
    const batch: BulkCorrectionBatch = {
      id: nextId("g02-bulk", count),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      batchNumber: `BLK-2026-${String(count + 1).padStart(4, "0")}`,
      initiatedBy: actor.userId,
      rows: input.rows.map((row, index) => ({ ...row, rowNo: index + 1 })),
      totalRows: input.rows.length,
      validRows: 0,
      invalidRows: 0,
      status: "UPLOADED",
      reason: input.reason,
    };
    this.repository.insertBatch(batch);
    this.audit.recordMutation(actor, {
      action: "G02_BULK_BATCH_CREATE",
      subjectRef: `bulk_correction_batches:${batch.id}`,
      metadata: { batchNumber: batch.batchNumber, totalRows: batch.totalRows },
    });
    return batch;
  }

  /**
   * FR-G02-009 AC1/AC2 dry-run: existence, catalog registration, one-open-change, duplicate
   * field per employee, and the FR-G02-018 status gate per row. A failing row is rejected
   * with row-level reasons (BR2 — never silently skipped); a non-ACTIVE row stays valid but
   * routes to the elevated path (BR5).
   */
  validateBatch(actor: ActorContext, batchId: string): BulkValidationReport {
    this.authorization.check(actor, "g02.bulk.manage", actor);
    const batch = this.requireBatch(actor, batchId);
    if (batch.status !== "UPLOADED" && batch.status !== "VALIDATED") {
      throw new FoundationError("CONFLICT", `Batch in status ${batch.status} can no longer be validated`);
    }
    const seen = new Set<string>();
    const report: BulkRowValidation[] = batch.rows.map((row) => {
      const reasons: string[] = [];
      let elevatedPath: G02ElevatedPath = "NONE";
      let sensitivity: BulkRowValidation["sensitivity"];
      const employee = this.employeeMaster.getById(actor, row.employeeId);
      if (!employee) {
        reasons.push("EMPLOYEE_NOT_FOUND");
      }
      const catalogEntry = this.catalogRepository.findSensitivityCatalogEntry(actor, row.fieldKey);
      if (!catalogEntry) {
        reasons.push("FIELD_NOT_IN_SENSITIVITY_CATALOG");
      } else {
        sensitivity = catalogEntry.sensitivity;
      }
      const dedupKey = `${row.employeeId}::${row.fieldKey}`;
      if (seen.has(dedupKey)) {
        // Edge case "duplicate field per employee" — CONFLICT, rejected not skipped (BR2).
        reasons.push("DUPLICATE_FIELD_FOR_EMPLOYEE");
      }
      seen.add(dedupKey);
      if (employee && this.hasOpenChange(actor, row.employeeId, row.fieldKey)) {
        reasons.push("ONE_OPEN_CHANGE");
      }
      if (employee && !isActiveForGate(employee)) {
        // BR5: rows on non-ACTIVE employees route to the elevated path, never ordinary bulk.
        elevatedPath = this.resolveElevatedPath(employee, row.fieldKey);
      }
      return { rowNo: row.rowNo, valid: reasons.length === 0, reasons, elevatedPath, sensitivity };
    });
    batch.dryRunReport = report;
    batch.validRows = report.filter((row) => row.valid).length;
    batch.invalidRows = report.length - batch.validRows;
    batch.status = "VALIDATED";
    this.repository.updateBatch(batch);
    this.audit.recordMutation(actor, {
      action: "G02_BULK_BATCH_VALIDATE",
      subjectRef: `bulk_correction_batches:${batch.id}`,
      metadata: { totalRows: batch.totalRows, validRows: batch.validRows, invalidRows: batch.invalidRows },
    });
    return {
      batchId: batch.id,
      status: batch.status,
      totalRows: batch.totalRows,
      validRows: batch.validRows,
      invalidRows: batch.invalidRows,
      rows: report,
    };
  }

  /**
   * FR-G02-009 AC3: valid rows materialize child change_requests (origin BULK, default
   * change_type CORRECTION per BR4, risk-evaluated at submit) and the batch routes for ONE
   * aggregate P01 approval honoring the highest sensitivity across its children.
   */
  submitBatch(actor: ActorContext, batchId: string): BulkCorrectionBatch {
    this.authorization.check(actor, "g02.bulk.manage", actor);
    const batch = this.requireBatch(actor, batchId);
    if (batch.status !== "VALIDATED") {
      throw new FoundationError("CONFLICT", `Batch in status ${batch.status} cannot be submitted for approval`);
    }
    if (batch.validRows === 0) {
      throw new FoundationError("PRECONDITION_FAILED", "A batch with no valid rows cannot route for approval");
    }
    const validRowNos = new Set((batch.dryRunReport ?? []).filter((row) => row.valid).map((row) => row.rowNo));
    let highest: G02GovernedChangeRequest["sensitivity"] = "LOW";
    for (const row of batch.rows) {
      if (!validRowNos.has(row.rowNo)) {
        continue; // AC edge "mixed valid/invalid": only valid rows proceed; invalid stay reported.
      }
      const child = this.materializeRequest(
        actor,
        {
          employeeId: row.employeeId,
          fieldKey: row.fieldKey,
          newValue: row.newValue,
          reason: row.reason ?? batch.reason ?? `Bulk correction ${batch.batchNumber}`,
          origin: "BULK",
          changeType: row.changeType ?? "CORRECTION",
        },
        { batchId: batch.id, rowNo: row.rowNo }
      );
      if (sensitivityRank(child.sensitivity) > sensitivityRank(highest)) {
        highest = child.sensitivity;
      }
      // FR-G02-017/X.2: each affected employee receives an out-of-band data-subject notice.
      this.notifications.publish(actor, {
        recipientEmployeeId: row.employeeId,
        messageId: "G02_DATA_SUBJECT_NOTICE",
        channel: "IN_APP",
        relatedRef: `change_requests:${child.id}`,
        mergeFields: { batchNumber: batch.batchNumber, fieldKey: row.fieldKey },
      });
    }
    const rule = this.requireMatrixRule(actor, highest);
    const started = this.workflow.start(actor, {
      workflowCode: "WF-G02-BULK-CORRECTIONS",
      subjectRef: `bulk_correction_batches:${batch.id}`,
      stage: rule.stage,
      resolverRule: { mechanism: "NAMED_ROLE", roleCode: rule.requiredRole },
      asOf: "2026-07-03",
    });
    batch.highestSensitivity = highest;
    batch.workflowInstanceId = started.instance.id;
    batch.status = "PENDING_APPROVAL";
    this.repository.updateBatch(batch);
    this.audit.recordMutation(actor, {
      action: "G02_BULK_BATCH_SUBMIT",
      subjectRef: `bulk_correction_batches:${batch.id}`,
      metadata: { highestSensitivity: highest, workflowInstanceId: started.instance.id, stage: rule.stage },
    });
    return this.requireBatch(actor, batchId);
  }

  /**
   * FR-G02-009 AC4 aggregate approval + commit: SoD approver != initiator (BR3); on approval
   * valid rows commit individually and idempotently; per-row failures are recorded and the
   * batch terminates PARTIAL_FAILED (never wholesale rollback).
   */
  approveBatch(actor: ActorContext, batchId: string): BulkCorrectionBatch {
    this.authorization.check(actor, "g02.change.approve", actor);
    const batch = this.requireBatch(actor, batchId);
    if (batch.status !== "PENDING_APPROVAL") {
      throw new FoundationError("CONFLICT", `Batch in status ${batch.status} cannot be approved`);
    }
    if (actor.userId === batch.initiatedBy) {
      throw new FoundationError("FORBIDDEN", "Separation of duties: the batch initiator cannot approve it", {
        details: { messageId: "ERR-G02-SOD", initiatedBy: batch.initiatedBy },
      });
    }
    if (batch.workflowInstanceId) {
      this.workflow.actOnInstance(actor, { instanceId: batch.workflowInstanceId, action: "APPROVE" });
    }
    batch.status = "APPROVED";
    batch.approvedBy = actor.userId;
    this.repository.updateBatch(batch);
    // The aggregate approval sanctions each standard child; elevated children keep their
    // dual-control requirement (BR3/FR-G02-018 BR3 — bulk cannot bypass the elevated path).
    for (const child of this.listBatchChildren(actor, batch.id)) {
      if (child.status !== "SUBMITTED" && child.status !== "IN_REVIEW") {
        continue;
      }
      if (actor.userId === child.requestedBy || child.approvedBy.includes(actor.userId)) {
        continue;
      }
      child.approvedBy = [...child.approvedBy, actor.userId];
      child.status = child.approvedBy.length >= child.requiredApprovals ? "APPROVED" : "IN_REVIEW";
      this.repository.updateRequest(child);
    }
    this.audit.recordMutation(actor, {
      action: "G02_BULK_BATCH_APPROVE",
      subjectRef: `bulk_correction_batches:${batch.id}`,
      metadata: { approvedBy: actor.userId },
    });
    return this.commitBatch(actor, batchId);
  }

  /**
   * Per-row idempotent commit sweep. Replaying a batch whose rows are already committed is a
   * no-op; a row whose commit fails (e.g. a BLOCKED risk band -> ERR-G02-RISKBLOCK) is
   * recorded with its registered error code and the batch ends PARTIAL_FAILED. Retrying
   * after remediation commits only the remaining rows.
   */
  commitBatch(actor: ActorContext, batchId: string): BulkCorrectionBatch {
    this.authorization.check(actor, "g02.change.commit", actor);
    const batch = this.requireBatch(actor, batchId);
    if (batch.status !== "APPROVED" && batch.status !== "COMMITTED" && batch.status !== "PARTIAL_FAILED") {
      throw new FoundationError("CONFLICT", `Batch in status ${batch.status} cannot be committed`);
    }
    const children = this.listBatchChildren(actor, batch.id);
    const results: BulkRowCommitResult[] = [];
    for (const child of children) {
      const rowNo = child.bulkRowNo ?? 0;
      if (child.status === "COMMITTED") {
        results.push({ rowNo, changeRequestId: child.id, committed: true }); // idempotent replay no-op
        continue;
      }
      try {
        this.commitRequestRow(actor, child, `${batch.id}:row:${rowNo}`);
        results.push({ rowNo, changeRequestId: child.id, committed: true });
      } catch (error) {
        // FR-G02-009 AC4: per-row isolation — the failure is recorded, siblings proceed.
        const code = error instanceof FoundationError ? error.code : "INTERNAL";
        const failed = this.repository.findRequest(actor, child.id);
        if (failed && failed.status !== "COMMITTED" && failed.status !== "REJECTED") {
          failed.failureReason = code;
          this.repository.updateRequest(failed);
        }
        results.push({ rowNo, changeRequestId: child.id, committed: false, errorCode: code });
      }
    }
    batch.commitReport = results;
    batch.status = results.some((row) => !row.committed) ? "PARTIAL_FAILED" : "COMMITTED";
    this.repository.updateBatch(batch);
    this.audit.recordMutation(actor, {
      action: "G02_BULK_BATCH_COMMIT",
      subjectRef: `bulk_correction_batches:${batch.id}`,
      metadata: {
        status: batch.status,
        committedRows: results.filter((row) => row.committed).length,
        failedRows: results.filter((row) => !row.committed).length,
      },
    });
    return this.requireBatch(actor, batchId);
  }

  getBatchReport(scope: TenantScope, batchId: string): BulkCorrectionBatch {
    requireTenantScope(scope);
    return this.requireBatch(scope, batchId);
  }

  // =====================================================================================
  // internals
  // =====================================================================================

  /**
   * Shared submit path (single + bulk child): catalog lookup, FR-G02-018 status gate with
   * the employment_status_at_submit snapshot, P01 routing from the ACTIVE matrix, and the
   * FR-G02-019 risk evaluation over the new request.
   */
  private materializeRequest(
    actor: ActorContext,
    input: GovernedChangeSubmitInput,
    bulk: { batchId: string; rowNo: number } | undefined
  ): G02GovernedChangeRequest {
    const employee = this.employeeMaster.getById(actor, input.employeeId);
    if (!employee) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    const catalogEntry = this.requireCatalogEntry(actor, input.fieldKey);
    // FR-G02-018 AC1/BR1: the gate precedes routing. Self-service on any non-ACTIVE target
    // fails closed with the registered 403 code. ON_LEAVE is treated as ACTIVE for routine
    // fields per the BRD edge case (configuration can elevate it later).
    const employmentStatusAtSubmit = employee.employmentStatus;
    if (input.origin === "SELF_SERVICE" && !isActiveForGate(employee)) {
      throw new FoundationError("ERR-G02-STATUSGATE", "Self-service changes are blocked for non-ACTIVE employee records", {
        details: { employmentStatusAtSubmit, rule: "FR-G02-018 AC1" },
      });
    }
    const elevatedPath = isActiveForGate(employee) ? "NONE" : this.resolveElevatedPath(employee, input.fieldKey);
    const rule = this.requireMatrixRule(actor, catalogEntry.sensitivity, catalogEntry);
    // FR-G02-018 AC3/BR2: elevated paths carry dual control — Appointing-Authority sanction
    // for the DECEASED family-pension path; elevated authority + justification otherwise.
    const requiredApprovals = elevatedPath === "NONE" ? 1 : 2;
    const stage = elevatedPath === "FAMILY_PENSION" ? "PENDING_FAMILY_PENSION_SANCTION" : elevatedPath === "STATUS_ELEVATED" ? "PENDING_ELEVATED_SANCTION" : rule.stage;
    const roleCode = elevatedPath === "NONE" ? rule.requiredRole : "appointing_authority";
    const requestId = nextId("g02-gcr", this.repository.countRequests());
    const started = this.workflow.start(actor, {
      workflowCode: "WF-G02-CHANGE-GOVERNANCE",
      subjectRef: `change_requests:${requestId}`,
      stage,
      resolverRule: { mechanism: "NAMED_ROLE", roleCode },
      asOf: "2026-07-03",
    });
    const request: G02GovernedChangeRequest = {
      id: requestId,
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      crNumber: `CR-2026-${String(this.repository.countRequests() + 1).padStart(6, "0")}`,
      targetEmployeeId: input.employeeId,
      requestedBy: actor.userId,
      requestOrigin: input.origin,
      changeType: input.changeType ?? (input.origin === "BULK" ? "CORRECTION" : "UPDATE"),
      fieldKey: input.fieldKey,
      fieldGroup: catalogEntry.fieldGroup,
      sensitivity: catalogEntry.sensitivity,
      oldValue: "",
      newValue: input.newValue,
      status: "SUBMITTED",
      employmentStatusAtSubmit,
      riskScore: 0,
      riskBand: "LOW",
      fraudReviewRequired: false,
      elevatedPath,
      requiredApprovals,
      approvedBy: [],
      workflowStage: stage,
      workflowInstanceId: started.instance.id,
      bulkBatchId: bulk?.batchId,
      bulkRowNo: bulk?.rowNo,
      reason: input.reason,
      submittedAt: new Date().toISOString(),
    };
    this.repository.insertRequest(request);
    this.evaluateRisk(actor, request);
    return this.requireRequest(actor, requestId);
  }

  /**
   * FR-G02-019 AC1/AC2 risk engine: each fired detector appends ONE cr_risk_signals row
   * (INSERT-only) with type, severity, score and evidence, then the header band aggregates.
   */
  private evaluateRisk(actor: ActorContext, request: G02GovernedChangeRequest): void {
    const scope: TenantScope = actor;
    const peers = this.repository.listRequests(scope).filter((item) => item.id !== request.id && item.status !== "REJECTED");
    if (isBankAccountField(request.fieldKey)) {
      // AC4 mule detector: the same NEW bank account across >= 2 employees within the window.
      const matches = peers.filter(
        (item) =>
          isBankAccountField(item.fieldKey) &&
          item.newValue === request.newValue &&
          item.targetEmployeeId !== request.targetEmployeeId &&
          withinWindowDays(item.submittedAt, request.submittedAt, this.duplicateBankWindowDays)
      );
      if (matches.length > 0) {
        this.appendSignal(actor, request, {
          signalType: "DUPLICATE_BANK_ACCOUNT",
          severity: "BLOCK",
          scoreContribution: DUPLICATE_BANK_SCORE,
          detail: {
            matchedEmployeeIds: [...new Set(matches.map((item) => item.targetEmployeeId))],
            matchedChangeRequestIds: matches.map((item) => item.id),
          },
        });
      }
    }
    if (isFinancialChange(request)) {
      // AC5 (R1): an auth-bearing contact change followed by a FINANCIAL change for the same
      // employee within the window.
      const priorAuthChanges = peers.filter(
        (item) =>
          item.targetEmployeeId === request.targetEmployeeId &&
          AUTH_CHANNEL_FIELD_KEYS.includes(item.fieldKey) &&
          withinWindowDays(item.submittedAt, request.submittedAt, this.authThenFinancialWindowDays)
      );
      if (priorAuthChanges.length > 0) {
        this.appendSignal(actor, request, {
          signalType: "AUTH_CHANNEL_THEN_FINANCIAL",
          severity: "HIGH",
          scoreContribution: AUTH_THEN_FINANCIAL_SCORE,
          detail: { authChannelChangeRequestIds: priorAuthChanges.map((item) => item.id) },
        });
      }
    }
    this.reaggregateRisk(actor, request);
  }

  private appendSignal(
    actor: ActorContext,
    request: G02GovernedChangeRequest,
    input: Pick<CrRiskSignal, "signalType" | "severity" | "scoreContribution" | "detail">
  ): void {
    this.repository.appendRiskSignal({
      id: nextId("g02-risk", this.repository.countRiskSignals()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      changeRequestId: request.id,
      detectedAt: new Date().toISOString(),
      ...input,
    });
    this.audit.recordMutation(actor, {
      action: "G02_RISK_SIGNAL_DETECTED",
      subjectRef: `change_requests:${request.id}`,
      metadata: { signalType: input.signalType, severity: input.severity, scoreContribution: input.scoreContribution },
    });
  }

  /**
   * Aggregate risk_score (0-100) and risk_band from the un-cleared signals: any un-cleared
   * BLOCK-severity signal forces BLOCKED (a CONFIRMED_FRAUD or ESCALATED review keeps the
   * block; only CLEARED removes the contribution — BR3: review only ever adds scrutiny).
   */
  private reaggregateRisk(actor: ActorContext, request: G02GovernedChangeRequest): void {
    const active = this.repository.listRiskSignals(actor, request.id).filter((signal) => signal.reviewOutcome !== "CLEARED");
    const score = Math.min(
      100,
      active.reduce((sum, signal) => sum + signal.scoreContribution, 0)
    );
    let band: G02RiskBand = "LOW";
    if (active.some((signal) => signal.severity === "BLOCK")) {
      band = "BLOCKED";
    } else if (active.some((signal) => signal.severity === "HIGH") || score >= 60) {
      // FR-G02-019 AC3 / FR-G02-002 AC7: a HIGH-severity signal forces the fraud-review stage.
      band = "HIGH";
    } else if (score >= 30) {
      band = "MEDIUM";
    }
    request.riskScore = score;
    request.riskBand = band;
    // FR-G02-002 AC7: a HIGH band injects the mandatory CONDITIONAL fraud-review stage.
    request.fraudReviewRequired = band === "HIGH" || band === "BLOCKED";
    this.repository.updateRequest(request);
  }

  /** Shared per-row commit core for the single and bulk paths (risk gate first, fail-closed). */
  private commitRequestRow(actor: ActorContext, request: G02GovernedChangeRequest, idempotencyKey: string): void {
    if (request.riskBand === "BLOCKED") {
      // FR-G02-019 AC3: BLOCKED holds ANY commit attempt until a Fraud Reviewer clears it.
      throw new FoundationError("ERR-G02-RISKBLOCK", "Commit is held pending fraud review of blocking risk signals", {
        details: { changeRequestId: request.id, riskBand: request.riskBand, rule: "FR-G02-019 AC3" },
      });
    }
    if (request.status !== "APPROVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only approved governed change requests can be committed");
    }
    if (request.approvedBy.length < request.requiredApprovals) {
      // FR-G02-018 BR2 defence in depth: an elevated change is never auto-applied.
      throw new FoundationError("PRECONDITION_FAILED", "Elevated changes require dual control before commit", {
        details: { rule: "VAL-G02-DUALAUTH", elevatedPath: request.elevatedPath },
      });
    }
    request.status = "COMMITTED";
    request.commitIdempotencyKey = idempotencyKey;
    request.committedAt = new Date().toISOString();
    request.failureReason = undefined;
    this.repository.updateRequest(request);
    this.audit.recordMutation(actor, {
      action: "G02_GOVERNED_CHANGE_COMMIT",
      subjectRef: `change_requests:${request.id}`,
      metadata: { fieldKey: request.fieldKey, bulkBatchId: request.bulkBatchId ?? "", riskBand: request.riskBand },
    });
  }

  private hasOpenChange(scope: TenantScope, employeeId: string, fieldKey: string): boolean {
    return this.repository
      .listRequests(scope)
      .some(
        (item) =>
          item.targetEmployeeId === employeeId &&
          item.fieldKey === fieldKey &&
          (item.status === "SUBMITTED" || item.status === "IN_REVIEW" || item.status === "APPROVED")
      );
  }

  private resolveElevatedPath(employee: EmployeeRecord, fieldKey: string): G02ElevatedPath {
    if (employee.employmentStatus === "DECEASED" && (isBankAccountField(fieldKey) || NOMINEE_FIELD_KEYS.includes(fieldKey))) {
      // FR-G02-018 AC3: DECEASED bank/nominee -> family-pension controlled path.
      return "FAMILY_PENSION";
    }
    return "STATUS_ELEVATED";
  }

  private requireCatalogEntry(scope: TenantScope, fieldKey: string): FieldSensitivityCatalogEntry {
    const entry = this.catalogRepository.findSensitivityCatalogEntry(scope, fieldKey);
    if (!entry) {
      throw new FoundationError("VALIDATION_FAILED", "Field is not registered in the sensitivity catalog", {
        field: "fieldKey",
        details: { fieldKey },
      });
    }
    return entry;
  }

  private requireMatrixRule(
    scope: TenantScope,
    sensitivity: G02GovernedChangeRequest["sensitivity"],
    entry?: FieldSensitivityCatalogEntry
  ) {
    const matrix = this.catalogRepository.findActiveApprovalMatrix(scope);
    // Aggregate batch routing resolves by sensitivity alone; the probe fieldKey/group never
    // match a field-specific rule because rules carry non-empty keys.
    const probe = entry ?? { fieldKey: "", fieldGroup: "DEMOGRAPHIC" as G02FieldGroup, sensitivity };
    const rule = matrix ? resolveApprovalRule(matrix, probe) : undefined;
    if (!rule) {
      throw new FoundationError("PRECONDITION_FAILED", "No active approval matrix rule covers this sensitivity", {
        details: { sensitivity },
      });
    }
    return rule;
  }

  private requireRequest(scope: TenantScope, requestId: string): G02GovernedChangeRequest {
    const request = this.repository.findRequest(scope, requestId);
    if (!request) {
      throw new FoundationError("NOT_FOUND", "G02 governed change request not found");
    }
    return request;
  }

  private requireBatch(scope: TenantScope, batchId: string): BulkCorrectionBatch {
    const batch = this.repository.findBatch(scope, batchId);
    if (!batch) {
      throw new FoundationError("NOT_FOUND", "G02 bulk correction batch not found");
    }
    return batch;
  }

  private listBatchChildren(scope: TenantScope, batchId: string): G02GovernedChangeRequest[] {
    return this.repository
      .listRequests(scope)
      .filter((item) => item.bulkBatchId === batchId)
      .sort((left, right) => (left.bulkRowNo ?? 0) - (right.bulkRowNo ?? 0));
  }
}

function isBankAccountField(fieldKey: string): boolean {
  return BANK_ACCOUNT_FIELD_KEYS.includes(fieldKey);
}

function isFinancialChange(request: G02GovernedChangeRequest): boolean {
  return request.fieldGroup === "FINANCIAL" || isBankAccountField(request.fieldKey) || NOMINEE_FIELD_KEYS.includes(request.fieldKey);
}

/** BRD FR-G02-018 edge case: ON_LEAVE is treated as ACTIVE for routine fields. */
function isActiveForGate(employee: EmployeeRecord): boolean {
  return employee.employmentStatus === "ACTIVE" || employee.employmentStatus === "ON_LEAVE";
}

function withinWindowDays(earlierIso: string, laterIso: string, windowDays: number): boolean {
  const deltaMs = Math.abs(new Date(laterIso).getTime() - new Date(earlierIso).getTime());
  return deltaMs <= windowDays * 24 * 60 * 60 * 1000;
}

function sensitivityRank(sensitivity: G02GovernedChangeRequest["sensitivity"]): number {
  switch (sensitivity) {
    case "LOW":
      return 0;
    case "MEDIUM":
      return 1;
    case "HIGH":
      return 2;
    case "STATUTORY":
      return 3;
  }
}
