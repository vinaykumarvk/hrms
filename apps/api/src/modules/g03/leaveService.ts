import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { WorkflowAction, WorkflowInstance, HrmsWorkflowService } from "../../platform/workflow/hrmsWorkflowService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { LeaveSrOutboxEvent, LeaveSrRelayService } from "../g04/leaveSrRelayService";
import { JobRun, JobService } from "../../jobs/jobService";
import { LeaveRepository } from "./leaveRepository";
import { AuthorityResolutionService } from "../../platform/authority-resolution/authorityResolutionService";

export type LeaveApplicationStatus = "SUBMITTED" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "CANCELLED";

/**
 * FR-10 leave-type + accrual-policy configuration (BRD G03 §5.2 E12 leave_types / E13
 * leave_accrual_policies). Submission validation, opening balances, holiday counting,
 * eligibility, and entitlement caps are all driven from this catalog — not hardcoded.
 */
export interface LeaveTypeConfig {
  tenantId: string;
  entityId?: string;
  leaveTypeId: string;
  name: string;
  /** Sandwich behavior per type: when false, holidays are excluded from totalDays (FR-02). */
  countsHolidays: boolean;
  /** Opening balance credited when a leave-year balance is first created. */
  openingBalance: number;
  /** E13 leave_accrual_policies projection consumed by accrue(). */
  accrualPolicy: { frequency: "MONTHLY" | "HALF_YEARLY" | "YEARLY"; unitsPerPeriod: number };
  /** Minimum completed service (months, as of the leave start date) to be eligible. */
  eligibility?: { minServiceMonths: number };
  /** Sanction-based entitlement cap per leave year (reserved + debited may not exceed it). */
  entitlementCapDays?: number;
  status: "ACTIVE" | "INACTIVE";
  /** Post-hr_admin-goal thin build (`g03.leave.sanction_special`): special leave types
   *  (maternity/study/sabbatical/commuted/LWP) require a distinct final-sanction sign-off beyond
   *  ordinary manager approval, on top of (not instead of) the regular approve/reject flow. */
  requiresFinalSanction?: boolean;
}

/** FR-02 holiday calendar entry (BRD G03 §5.2 E3/E4 holiday_calendars / holidays). */
export interface HolidayEntry {
  tenantId: string;
  entityId?: string;
  calendarId: string;
  holidayDate: string;
  name: string;
}

export interface LeaveBalance {
  tenantId: string;
  entityId?: string;
  employeeId: string;
  leaveTypeId: string;
  leaveYear: number;
  currentBalance: number;
  reserved: number;
  debited: number;
  availableBalance: number;
  version: number;
}

export interface LeaveApplication {
  id: string;
  tenantId: string;
  entityId?: string;
  applicationNo: string;
  employeeId: string;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  totalDays: number;
  status: LeaveApplicationStatus;
  workflowInstanceId: string;
  workflowTaskId: string;
  resolverType: "REPORTING_CHAIN";
  resolverEvidence: Record<string, unknown>;
  delegatedToEmployeeId?: string;
  srEventId?: string;
  g04OutboxEventId?: string;
  /** G03-issued spell lineage key; stable across approve/amend/cancel and propagated to the G04 outbox. */
  leaveSpellLineageId: string;
  /** Post-hr_admin-goal thin build (`g03.leave.sanction_special`): set once a distinct
   *  sanctioning authority has given final sign-off on a special-leave-type application that has
   *  already cleared ordinary manager approval. Additive to `status`, not a new state — an
   *  APPROVED special-leave application is not "final" for entitlement purposes until sanctioned. */
  finalSanctionedByUserId?: string;
  finalSanctionedAt?: string;
}

export interface LeaveLedgerEntry {
  id: string;
  employeeId: string;
  leaveApplicationId: string;
  entryType: "ACCRUAL" | "RESERVATION" | "DEBIT" | "RELEASE" | "CANCELLATION_CREDIT";
  units: number;
  balanceAfter: number;
}

export interface LeaveApprovalResult {
  application: LeaveApplication;
  action: WorkflowAction;
  srEventId?: string;
  outboxEvent: LeaveSrOutboxEvent;
}

/**
 * FR-04 derived day statuses (BRD G03 g03_attendance_status subset consumed by this slice)
 * plus the legacy anomaly-handling pair. The status is DERIVED — leave approval, the FR-02
 * holiday calendar, and punch completeness drive derivation; callers never pass a status.
 */
export type AttendanceDayStatus =
  | "PRESENT"
  | "ABSENT"
  | "ON_LEAVE"
  | "HOLIDAY"
  | "HALF_DAY"
  | "ANOMALY"
  | "REGULARISED";

export interface AttendanceRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  attendanceDate: string;
  inTime?: string;
  outTime?: string;
  status: AttendanceDayStatus;
  anomalyCode?: "MISSING_IN" | "MISSING_OUT";
  /** FR-05: set when a day has been regularised (drives the per-period cap). */
  isRegularised?: boolean;
  /** Maker of the capture (FR-05 "SoD by P02 (no self-approve)"); the regulariser must be a different user. */
  capturedByUserId?: string;
}

export interface PayrollSignal {
  id: string;
  employeeId: string;
  period: string;
  signalType: "LEAVE_DEBIT" | "LEAVE_REVERSAL" | "OVERTIME" | "ATTENDANCE_REGULARISED";
  sourceRef: string;
  units: number;
  status: "READY_FOR_G10";
}

/** FR-17 E20 payroll_attendance_feed row — per-employee per-period aggregate exposed to G10. */
export interface PayrollAttendanceFeedRow {
  id: string;
  tenantId: string;
  entityId?: string;
  payPeriod: string;
  employeeId: string;
  lwpDays: number;
  halfPayDays: number;
  paidOtMinutes: number;
  presentUnits: number;
  encashmentAmount: number;
  exportStatus: "PENDING" | "EXPORTED" | "ACKED" | "FAILED";
  isLocked: boolean;
}

/** FR-17/R6 E23 payroll_feed_adjustments row — next-period correction to a locked feed period. */
export interface PayrollFeedAdjustment {
  id: string;
  tenantId: string;
  entityId?: string;
  originalFeedId: string;
  appliedInPayPeriod: string;
  employeeId: string;
  adjustmentType: "LWP_DELTA" | "HALF_PAY_DELTA" | "OT_DELTA" | "PRESENT_DELTA" | "ENCASHMENT_DELTA";
  deltaValue: number;
  reason: string;
  sourceRefType: "REGULARISATION" | "ROSTER_EDIT" | "HOLIDAY_EDIT" | "LEAVE_CANCEL" | "MANUAL";
  sourceRefId?: string;
  status: "PENDING" | "EXPORTED" | "ACKED";
}

/** FR-05 regularisation discipline: backdate window (WINDOW_EXPIRED) + per-period cap. */
export interface AttendancePolicy {
  backdateWindowDays: number;
  regularisationCapPerPeriod: number;
  /** Punch spans shorter than this derive HALF_DAY instead of PRESENT (short attendance). */
  halfDayUnderMinutes: number;
}

/** Org-wide override roles for the attendance-regularisation SoD gate (FR-05 "SoD by P02 (no
 *  self-approve)"), mirroring the same override convention as bank-account approval and P01
 *  workflow-approver enforcement elsewhere in this codebase. */
const ATTENDANCE_REGULARISE_OVERRIDE_ROLES = new Set(["hr_admin", "attendance_admin", "system"]);

/** Post-full-review-goal fix: self-service leave/attendance reads (my balance, my attendance
 *  summary) need a need-to-know gate, same shape as every other module's self-scope. */
const LEAVE_READ_OVERRIDE_ROLES = new Set(["hr_admin", "leave_admin", "system"]);

const DEFAULT_ATTENDANCE_POLICY: AttendancePolicy = {
  backdateWindowDays: 30,
  regularisationCapPerPeriod: 3,
  halfDayUnderMinutes: 240,
};

export class LeaveService {
  private policy: AttendancePolicy = { ...DEFAULT_ATTENDANCE_POLICY };

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly workflow: HrmsWorkflowService,
    private readonly leaveSrRelay: LeaveSrRelayService,
    private readonly jobs: JobService,
    private readonly notifications: NotificationService,
    private readonly repository: LeaveRepository,
    private readonly authorityResolution: AuthorityResolutionService
  ) {}

  submit(
    actor: ActorContext,
    input: { employeeId: string; leaveTypeId: string; fromDate: string; toDate: string; reason?: string }
  ): { application: LeaveApplication; workflow: { instance: WorkflowInstance; taskId: string }; balance: LeaveBalance } {
    this.authorization.check(actor, "g03.leave.submit", actor);
    this.requireEmployee(actor, input.employeeId);
    const config = this.requireLeaveType(actor, input.leaveTypeId);
    this.assertEligibility(actor, input.employeeId, config, input.fromDate);
    const totalDays = this.countLeaveDays(actor, input.fromDate, input.toDate, config);
    if (totalDays <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "Requested spell falls entirely on holidays", { field: "fromDate" });
    }
    this.assertNoOverlap(actor, input.employeeId, input.fromDate, input.toDate);
    const balance = this.getOrCreateBalance(actor, input.employeeId, input.leaveTypeId, yearOf(input.fromDate));
    if (balance.availableBalance < totalDays) {
      throw new FoundationError("INSUFFICIENT_BALANCE", "Available leave balance (after reservations) is less than requested", {
        field: "days",
        details: { availableBalance: balance.availableBalance, requested: totalDays },
      });
    }
    if (config.entitlementCapDays !== undefined && balance.reserved + balance.debited + totalDays > config.entitlementCapDays) {
      throw new FoundationError("ENTITLEMENT_EXCEEDED", "Requested spell exceeds the sanctioned entitlement for this leave type", {
        field: "days",
        details: { entitlementCapDays: config.entitlementCapDays, consumed: balance.reserved + balance.debited, requested: totalDays },
      });
    }
    const applicationSequence = this.repository.countApplications();
    const applicationId = nextId("leave-app", applicationSequence);
    const started = this.workflow.start(actor, {
      workflowCode: "WF-G03-LEAVE",
      subjectRef: `g03_leave_applications:${applicationId}`,
      stage: "PENDING_MANAGER",
      resolverRule: { mechanism: "REPORTING_CHAIN", subjectEmployeeId: input.employeeId },
      asOf: input.fromDate,
    });
    balance.reserved += totalDays;
    balance.availableBalance = balance.currentBalance - balance.reserved - balance.debited;
    balance.version += 1;
    this.repository.saveBalance(balance);
    this.repository.appendLedgerEntry({
      id: nextId("leave-ledger", this.repository.countLedgerEntries()),
      employeeId: input.employeeId,
      leaveApplicationId: applicationId,
      entryType: "RESERVATION",
      units: totalDays,
      balanceAfter: balance.availableBalance,
    });
    const application: LeaveApplication = {
      id: applicationId,
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      applicationNo: `LA/${yearOf(input.fromDate)}/${String(applicationSequence + 1).padStart(5, "0")}`,
      employeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      totalDays,
      status: "SUBMITTED",
      workflowInstanceId: started.instance.id,
      workflowTaskId: started.task.id,
      resolverType: "REPORTING_CHAIN",
      resolverEvidence: { ...started.task.resolution.evidence },
      leaveSpellLineageId: nextId("leave-spell", applicationSequence),
    };
    this.repository.insertApplication(application);
    this.audit.recordMutation(actor, {
      action: "G03_LEAVE_SUBMIT",
      subjectRef: `g03_leave_applications:${application.id}`,
      metadata: { workflowInstanceId: application.workflowInstanceId, resolverType: application.resolverType, reason: input.reason },
    });
    this.notifications.publish(actor, {
      recipientEmployeeId: started.task.resolution.selectedAssignees[0]?.employeeId,
      messageId: "G03_LEAVE_SUBMITTED",
      channel: "IN_APP",
      relatedRef: `g03_leave_applications:${application.id}`,
      mergeFields: { applicationNo: application.applicationNo },
    });
    return {
      application: this.cloneApplication(application),
      workflow: { instance: started.instance, taskId: started.task.id },
      balance: this.cloneBalance(balance),
    };
  }

  delegate(actor: ActorContext, leaveApplicationId: string, delegateEmployeeId: string): { application: LeaveApplication; action: WorkflowAction } {
    this.authorization.check(actor, "g03.leave.delegate", actor);
    const application = this.requireApplication(actor, leaveApplicationId);
    if (application.status !== "SUBMITTED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only submitted leave can be delegated");
    }
    const action = this.workflow.actOnInstance(actor, { instanceId: application.workflowInstanceId, action: "DELEGATE" });
    application.delegatedToEmployeeId = delegateEmployeeId;
    this.repository.updateApplication(application);
    this.audit.recordMutation(actor, {
      action: "G03_LEAVE_DELEGATE",
      subjectRef: `g03_leave_applications:${application.id}`,
      metadata: { workflowActionId: action.id, delegateEmployeeId },
    });
    this.notifications.publish(actor, {
      recipientEmployeeId: delegateEmployeeId,
      messageId: "G03_LEAVE_DELEGATED",
      channel: "IN_APP",
      relatedRef: `g03_leave_applications:${application.id}`,
      mergeFields: { applicationNo: application.applicationNo },
    });
    return { application: this.cloneApplication(application), action };
  }

  approve(actor: ActorContext, leaveApplicationId: string, idempotencyKey: string, expectedVersion?: number): LeaveApprovalResult {
    this.authorization.check(actor, "g03.leave.approve", actor);
    const application = this.requireApplication(actor, leaveApplicationId);
    if (application.status === "APPROVED" && application.g04OutboxEventId) {
      const existingOutbox = this.requireOutbox(actor, application.g04OutboxEventId);
      const replayAction = this.workflow.actOnInstance(actor, { instanceId: application.workflowInstanceId, action: "QUERY" });
      return { application: this.cloneApplication(application), action: replayAction, srEventId: application.srEventId, outboxEvent: this.cloneOutbox(existingOutbox) };
    }
    if (application.status !== "SUBMITTED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only submitted leave can be approved");
    }
    const balance = this.getOrCreateBalance(actor, application.employeeId, application.leaveTypeId, yearOf(application.fromDate));
    this.assertBalanceVersion(balance, expectedVersion);
    const action = this.workflow.actOnInstance(actor, { instanceId: application.workflowInstanceId, action: "APPROVE" });
    balance.reserved -= application.totalDays;
    balance.debited += application.totalDays;
    balance.availableBalance = balance.currentBalance - balance.reserved - balance.debited;
    balance.version += 1;
    this.repository.saveBalance(balance);
    this.repository.appendLedgerEntry({
      id: nextId("leave-ledger", this.repository.countLedgerEntries()),
      employeeId: application.employeeId,
      leaveApplicationId: application.id,
      entryType: "DEBIT",
      units: application.totalDays,
      balanceAfter: balance.availableBalance,
    });
    application.status = "APPROVED";
    const payload = {
      applicationNo: application.applicationNo,
      leaveTypeId: application.leaveTypeId,
      fromDate: application.fromDate,
      toDate: application.toDate,
      totalDays: application.totalDays,
    };
    const readyOutbox = this.leaveSrRelay.enqueueApprovedLeave(actor, {
      leaveApplicationId: application.id,
      employeeId: application.employeeId,
      eventDate: application.fromDate,
      payload,
      leaveSpellLineageId: application.leaveSpellLineageId,
    });
    const postedOutbox = this.leaveSrRelay.relayEvent(actor, readyOutbox.id);
    application.srEventId = postedOutbox.srEventId;
    application.g04OutboxEventId = postedOutbox.id;
    this.repository.updateApplication(application);
    this.emitPayrollSignal(actor, {
      employeeId: application.employeeId,
      period: periodOf(application.fromDate),
      signalType: "LEAVE_DEBIT",
      sourceRef: `g03_leave_applications:${application.id}`,
      units: application.totalDays,
    });
    this.audit.recordMutation(actor, {
      action: "G03_LEAVE_APPROVE",
      subjectRef: `g03_leave_applications:${application.id}`,
      metadata: { workflowActionId: action.id, srEventId: postedOutbox.srEventId, g04OutboxEventId: postedOutbox.id },
    });
    this.notifications.publish(actor, {
      recipientEmployeeId: application.employeeId,
      messageId: "G03_LEAVE_APPROVED",
      channel: "IN_APP",
      relatedRef: `g03_leave_applications:${application.id}`,
      mergeFields: { applicationNo: application.applicationNo, srEventId: postedOutbox.srEventId },
    });
    return { application: this.cloneApplication(application), action, srEventId: postedOutbox.srEventId, outboxEvent: postedOutbox };
  }

  /**
   * Post-hr_admin-goal thin build (`g03.leave.sanction_special`): a distinct final sign-off for
   * special leave types (maternity/study/sabbatical/commuted/LWP), required on top of — not
   * instead of — ordinary manager approval. Only leave types configured with
   * `requiresFinalSanction: true` are eligible; only an already-APPROVED application can be
   * sanctioned. Additive: does not change `status` or the reserved/debited balance math approve()
   * already performed.
   */
  sanctionSpecialLeave(actor: ActorContext, leaveApplicationId: string): LeaveApplication {
    this.authorization.check(actor, "g03.leave.sanction_special", actor);
    if (!actor.permissions?.includes("*") && !actor.roles?.some((role) => role === "sanctioning_authority" || role === "system")) {
      throw new FoundationError("FORBIDDEN", "Final sanction of a special leave requires the sanctioning_authority capability", { field: "actor" });
    }
    const application = this.requireApplication(actor, leaveApplicationId);
    const leaveType = this.requireLeaveType(actor, application.leaveTypeId);
    if (!leaveType.requiresFinalSanction) {
      throw new FoundationError("VALIDATION_FAILED", "This leave type does not require a final sanction", { field: "leaveTypeId" });
    }
    if (application.status !== "APPROVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only an approved special-leave application can be sanctioned");
    }
    if (application.finalSanctionedByUserId) {
      return this.cloneApplication(application);
    }
    application.finalSanctionedByUserId = actor.userId;
    application.finalSanctionedAt = new Date().toISOString();
    this.repository.updateApplication(application);
    this.audit.recordMutation(actor, {
      action: "G03_LEAVE_SPECIAL_SANCTIONED",
      subjectRef: `g03_leave_applications:${application.id}`,
      metadata: { leaveTypeId: application.leaveTypeId },
    });
    return this.cloneApplication(application);
  }

  cancelApproved(actor: ActorContext, leaveApplicationId: string, idempotencyKey: string, cancelDate: string, expectedVersion?: number): LeaveApprovalResult {
    this.authorization.check(actor, "g03.leave.cancel", actor);
    const application = this.requireApplication(actor, leaveApplicationId);
    if (application.status !== "APPROVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only approved leave can be cancelled");
    }
    const balance = this.getOrCreateBalance(actor, application.employeeId, application.leaveTypeId, yearOf(application.fromDate));
    this.assertBalanceVersion(balance, expectedVersion);
    const action = this.workflow.actOnInstance(actor, { instanceId: application.workflowInstanceId, action: "CANCEL" });
    balance.debited -= application.totalDays;
    balance.availableBalance = balance.currentBalance - balance.reserved - balance.debited;
    balance.version += 1;
    this.repository.saveBalance(balance);
    this.repository.appendLedgerEntry({
      id: nextId("leave-ledger", this.repository.countLedgerEntries()),
      employeeId: application.employeeId,
      leaveApplicationId: application.id,
      entryType: "CANCELLATION_CREDIT",
      units: application.totalDays,
      balanceAfter: balance.availableBalance,
    });
    application.status = "CANCELLED";
    this.repository.updateApplication(application);
    const readyOutbox = this.leaveSrRelay.enqueueLeaveCancellation(actor, {
      leaveApplicationId: application.id,
      employeeId: application.employeeId,
      eventDate: cancelDate,
      payload: { applicationNo: application.applicationNo, cancelDate, totalDays: application.totalDays, idempotencyKey },
      leaveSpellLineageId: application.leaveSpellLineageId,
    });
    const postedOutbox = this.leaveSrRelay.relayEvent(actor, readyOutbox.id);
    this.emitPayrollSignal(actor, {
      employeeId: application.employeeId,
      period: periodOf(cancelDate),
      signalType: "LEAVE_REVERSAL",
      sourceRef: `g03_leave_applications:${application.id}`,
      units: application.totalDays,
    });
    this.audit.recordMutation(actor, {
      action: "G03_LEAVE_CANCEL",
      subjectRef: `g03_leave_applications:${application.id}`,
      metadata: { srEventId: postedOutbox.srEventId },
    });
    return { application: this.cloneApplication(application), action, srEventId: postedOutbox.srEventId, outboxEvent: postedOutbox };
  }

  /**
   * FR-13: applicant withdrawal of a SUBMITTED spell. WITHDRAWN is reachable only from
   * SUBMITTED; the reservation is released and a RELEASE ledger entry is emitted.
   */
  withdraw(actor: ActorContext, leaveApplicationId: string, expectedVersion?: number): { application: LeaveApplication; action: WorkflowAction; balance: LeaveBalance } {
    this.authorization.check(actor, "g03.leave.withdraw", actor);
    const application = this.requireApplication(actor, leaveApplicationId);
    if (application.status !== "SUBMITTED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only submitted leave can be withdrawn");
    }
    const balance = this.getOrCreateBalance(actor, application.employeeId, application.leaveTypeId, yearOf(application.fromDate));
    this.assertBalanceVersion(balance, expectedVersion);
    const action = this.workflow.actOnInstance(actor, { instanceId: application.workflowInstanceId, action: "CANCEL" });
    balance.reserved -= application.totalDays;
    balance.availableBalance = balance.currentBalance - balance.reserved - balance.debited;
    balance.version += 1;
    this.repository.saveBalance(balance);
    this.repository.appendLedgerEntry({
      id: nextId("leave-ledger", this.repository.countLedgerEntries()),
      employeeId: application.employeeId,
      leaveApplicationId: application.id,
      entryType: "RELEASE",
      units: application.totalDays,
      balanceAfter: balance.availableBalance,
    });
    application.status = "WITHDRAWN";
    this.repository.updateApplication(application);
    this.audit.recordMutation(actor, {
      action: "G03_LEAVE_WITHDRAW",
      subjectRef: `g03_leave_applications:${application.id}`,
      metadata: { workflowActionId: action.id },
    });
    this.notifications.publish(actor, {
      recipientEmployeeId: application.employeeId,
      messageId: "G03_LEAVE_WITHDRAWN",
      channel: "IN_APP",
      relatedRef: `g03_leave_applications:${application.id}`,
      mergeFields: { applicationNo: application.applicationNo },
    });
    return { application: this.cloneApplication(application), action, balance: this.cloneBalance(balance) };
  }

  /**
   * FR-13: partial cancellation of an APPROVED spell from cancelFromDate onwards. The
   * remaining (holiday-aware) days are credited back via CANCELLATION_CREDIT, the spell is
   * shortened, and a corrected LEAVE_CANCELLED fact is relayed to G04/G12-SR.
   */
  cancelApprovedPartial(
    actor: ActorContext,
    leaveApplicationId: string,
    idempotencyKey: string,
    input: { cancelFromDate: string; expectedVersion?: number }
  ): { application: LeaveApplication; srEventId?: string; outboxEvent: LeaveSrOutboxEvent; balance: LeaveBalance; cancelledDays: number } {
    this.authorization.check(actor, "g03.leave.cancel", actor);
    const application = this.requireApplication(actor, leaveApplicationId);
    if (application.status !== "APPROVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only approved leave can be partially cancelled");
    }
    if (!dateOnly(input.cancelFromDate)) {
      throw new FoundationError("VALIDATION_FAILED", "cancelFromDate must use YYYY-MM-DD", { field: "cancelFromDate" });
    }
    if (input.cancelFromDate <= application.fromDate || input.cancelFromDate > application.toDate) {
      throw new FoundationError("VALIDATION_FAILED", "cancelFromDate must fall inside the approved spell (after its first day)", { field: "cancelFromDate" });
    }
    const config = this.requireLeaveType(actor, application.leaveTypeId);
    const cancelledDays = this.countLeaveDays(actor, input.cancelFromDate, application.toDate, config);
    if (cancelledDays <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "No debitable days remain after the requested partial cancellation date", { field: "cancelFromDate" });
    }
    const balance = this.getOrCreateBalance(actor, application.employeeId, application.leaveTypeId, yearOf(application.fromDate));
    this.assertBalanceVersion(balance, input.expectedVersion);
    balance.debited -= cancelledDays;
    balance.availableBalance = balance.currentBalance - balance.reserved - balance.debited;
    balance.version += 1;
    this.repository.saveBalance(balance);
    this.repository.appendLedgerEntry({
      id: nextId("leave-ledger", this.repository.countLedgerEntries()),
      employeeId: application.employeeId,
      leaveApplicationId: application.id,
      entryType: "CANCELLATION_CREDIT",
      units: cancelledDays,
      balanceAfter: balance.availableBalance,
    });
    const revisedToDate = dayBefore(input.cancelFromDate);
    application.toDate = revisedToDate;
    application.totalDays -= cancelledDays;
    this.repository.updateApplication(application);
    const readyOutbox = this.leaveSrRelay.enqueueLeaveCancellation(actor, {
      leaveApplicationId: application.id,
      employeeId: application.employeeId,
      eventDate: input.cancelFromDate,
      payload: {
        applicationNo: application.applicationNo,
        partial: true,
        cancelFromDate: input.cancelFromDate,
        cancelledDays,
        revisedToDate,
        revisedTotalDays: application.totalDays,
        idempotencyKey,
      },
      leaveSpellLineageId: application.leaveSpellLineageId,
    });
    const postedOutbox = this.leaveSrRelay.relayEvent(actor, readyOutbox.id);
    this.emitPayrollSignal(actor, {
      employeeId: application.employeeId,
      period: periodOf(input.cancelFromDate),
      signalType: "LEAVE_REVERSAL",
      sourceRef: `g03_leave_applications:${application.id}`,
      units: cancelledDays,
    });
    this.audit.recordMutation(actor, {
      action: "G03_LEAVE_PARTIAL_CANCEL",
      subjectRef: `g03_leave_applications:${application.id}`,
      metadata: { cancelFromDate: input.cancelFromDate, cancelledDays, srEventId: postedOutbox.srEventId },
    });
    return {
      application: this.cloneApplication(application),
      srEventId: postedOutbox.srEventId,
      outboxEvent: postedOutbox,
      balance: this.cloneBalance(balance),
      cancelledDays,
    };
  }

  accrue(actor: ActorContext, input: { employeeId: string; leaveTypeId: string; leaveYear: number; units?: number; effectiveDate: string }): LeaveBalance {
    this.authorization.check(actor, "g03.leave.accrue", actor);
    const config = this.requireLeaveType(actor, input.leaveTypeId);
    const units = input.units ?? config.accrualPolicy.unitsPerPeriod;
    if (units <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "Accrual units must be positive", { field: "units" });
    }
    const balance = this.getOrCreateBalance(actor, input.employeeId, input.leaveTypeId, input.leaveYear);
    balance.currentBalance += units;
    balance.availableBalance = balance.currentBalance - balance.reserved - balance.debited;
    balance.version += 1;
    this.repository.saveBalance(balance);
    this.repository.appendLedgerEntry({
      id: nextId("leave-ledger", this.repository.countLedgerEntries()),
      employeeId: input.employeeId,
      leaveApplicationId: `accrual:${input.effectiveDate}`,
      entryType: "ACCRUAL",
      units,
      balanceAfter: balance.availableBalance,
    });
    this.audit.recordMutation(actor, { action: "G03_LEAVE_ACCRUAL", subjectRef: `employees:${input.employeeId}`, metadata: { units, accrualFrequency: config.accrualPolicy.frequency } });
    return this.cloneBalance(balance);
  }

  /**
   * FR-04: capture punches and DERIVE the day status — callers never pass one. Precedence:
   * HOLIDAY (FR-02 calendar) > ON_LEAVE (approved spell covering the day) > punch handling
   * (HALF_DAY for short attendance, PRESENT, ABSENT, or ANOMALY with a missing-punch code).
   */
  captureAttendance(actor: ActorContext, input: { employeeId: string; attendanceDate: string; inTime?: string; outTime?: string }): AttendanceRecord {
    this.authorization.check(actor, "g03.attendance.capture", actor);
    this.requireEmployee(actor, input.employeeId);
    const derived = this.deriveDayStatus(actor, input);
    const record: AttendanceRecord = {
      id: nextId("attendance", this.repository.countAttendance()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      attendanceDate: input.attendanceDate,
      inTime: input.inTime,
      outTime: input.outTime,
      status: derived.status,
      anomalyCode: derived.anomalyCode,
      capturedByUserId: actor.userId,
    };
    this.repository.saveAttendance(record);
    this.audit.recordMutation(actor, { action: "G03_ATTENDANCE_CAPTURE", subjectRef: `attendance:${record.id}`, metadata: { status: record.status } });
    return { ...record };
  }

  /**
   * FR-05: missed-punch regularisation with backdate window (WINDOW_EXPIRED) and a
   * per-period cap (REGULARISATION_LIMIT). In a locked payroll period the correction is
   * routed as a payroll_feed_adjustments row (R6), never a locked-feed mutation.
   *
   * SoD CAVEAT (mirrors bankAccountService.ts's approveBankAccount): the maker!=checker
   * guarantee below is only as strong as the caller's ActorContext. This repo's dev-only HTTP
   * bridge (tools/local-api-server.mjs) decodes bearer tokens without signature verification, so
   * roles/permissions are effectively self-declared until a real, signature-verified auth layer
   * exists.
   */
  regulariseAttendance(
    actor: ActorContext,
    attendanceId: string,
    reason: string,
    asOfDate?: string
  ): { attendance: AttendanceRecord; job: JobRun; signal?: PayrollSignal; adjustment?: PayrollFeedAdjustment } {
    this.authorization.check(actor, "g03.attendance.regularise", actor);
    const attendance = this.requireAttendance(actor, attendanceId);
    const isOverride = actor.permissions?.includes("*") || actor.roles?.some((role) => ATTENDANCE_REGULARISE_OVERRIDE_ROLES.has(role));
    if (!isOverride && attendance.capturedByUserId !== undefined && attendance.capturedByUserId === actor.userId) {
      throw new FoundationError("SOD_VIOLATION", "The employee who captured this attendance day may not also regularise it", {
        field: "actor",
        details: { attendanceId: attendance.id },
      });
    }
    const asOf = asOfDate ?? todayIso();
    if (!dateOnly(asOf)) {
      throw new FoundationError("VALIDATION_FAILED", "asOfDate must use YYYY-MM-DD", { field: "asOfDate" });
    }
    const backdatedDays = daysBetween(attendance.attendanceDate, asOf);
    if (backdatedDays > this.policy.backdateWindowDays) {
      throw new FoundationError("WINDOW_EXPIRED", "Regularisation window for this attendance day has expired", {
        field: "attendanceDate",
        details: { backdateWindowDays: this.policy.backdateWindowDays, backdatedDays },
      });
    }
    const period = periodOf(attendance.attendanceDate);
    const regularisedInPeriod = this.repository
      .listAttendance(actor)
      .filter((record) => record.employeeId === attendance.employeeId && record.isRegularised === true && periodOf(record.attendanceDate) === period).length;
    if (regularisedInPeriod >= this.policy.regularisationCapPerPeriod) {
      throw new FoundationError("REGULARISATION_LIMIT", "Regularisation cap for this pay period has been reached", {
        field: "attendanceDate",
        details: { regularisationCapPerPeriod: this.policy.regularisationCapPerPeriod, period },
      });
    }
    attendance.status = "REGULARISED";
    attendance.anomalyCode = undefined;
    attendance.isRegularised = true;
    this.repository.saveAttendance(attendance);
    const run = this.jobs.start(actor, { jobId: "JOB-G03-ATTENDANCE-RECOMPUTE", runKey: attendance.id });
    const job = this.jobs.finish(actor, run.id, { rowsAffected: 1, outcomeDetail: { attendanceId: attendance.id, reason } });
    const emitted = this.emitPayrollSignal(actor, {
      employeeId: attendance.employeeId,
      period,
      signalType: "ATTENDANCE_REGULARISED",
      sourceRef: `attendance:${attendance.id}`,
      units: 1,
    });
    this.audit.recordMutation(actor, { action: "G03_ATTENDANCE_REGULARISE", subjectRef: `attendance:${attendance.id}`, metadata: { jobRunId: job.id } });
    return { attendance: { ...attendance }, job, signal: emitted.signal, adjustment: emitted.adjustment };
  }

  recordOvertime(actor: ActorContext, input: { employeeId: string; attendanceDate: string; minutes: number }): PayrollSignal | PayrollFeedAdjustment {
    this.authorization.check(actor, "g03.overtime.record", actor);
    if (input.minutes <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "Overtime minutes must be positive", { field: "minutes" });
    }
    const sourceRef = `overtime:${input.employeeId}:${input.attendanceDate}`;
    const emitted = this.emitPayrollSignal(actor, {
      employeeId: input.employeeId,
      period: periodOf(input.attendanceDate),
      signalType: "OVERTIME",
      sourceRef,
      units: input.minutes,
    });
    this.audit.recordMutation(actor, { action: "G03_OVERTIME_RECORD", subjectRef: sourceRef, metadata: { minutes: input.minutes } });
    return emitted.signal ? { ...emitted.signal } : { ...(emitted.adjustment as PayrollFeedAdjustment) };
  }

  /** FR-05 policy knobs (window/cap) and the short-attendance HALF_DAY threshold. */
  configureAttendancePolicy(actor: ActorContext, input: Partial<AttendancePolicy>): AttendancePolicy {
    this.authorization.check(actor, "g03.attendance.configure", actor);
    const merged: AttendancePolicy = { ...this.policy, ...input };
    if (merged.backdateWindowDays <= 0 || merged.regularisationCapPerPeriod <= 0 || merged.halfDayUnderMinutes <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "Attendance policy values must be positive", { field: "backdateWindowDays" });
    }
    this.policy = merged;
    this.audit.recordMutation(actor, { action: "G03_ATTENDANCE_POLICY_CONFIGURE", subjectRef: "attendance_policy:default", metadata: { ...merged } });
    return { ...this.policy };
  }

  /**
   * FR-17: aggregate the period's payroll signals + derived attendance into per-employee
   * payroll_attendance_feed rows. Generating into a locked period raises PERIOD_ALREADY_LOCKED.
   */
  generatePayrollFeed(actor: ActorContext, payPeriod: string): PayrollAttendanceFeedRow[] {
    this.authorization.check(actor, "g03.payroll.feed.generate", actor);
    if (!/^\d{4}-\d{2}$/.test(payPeriod)) {
      throw new FoundationError("VALIDATION_FAILED", "payPeriod must use YYYY-MM", { field: "payPeriod" });
    }
    this.assertFeedPeriodOpen(actor, payPeriod);
    const employeeIds = new Set(this.employeeMaster.list(actor).map((employee) => employee.id));
    const signals = this.repository.listPayrollSignals().filter((signal) => signal.period === payPeriod && employeeIds.has(signal.employeeId));
    const attendance = this.repository.listAttendance(actor).filter((record) => periodOf(record.attendanceDate) === payPeriod);
    const byEmployee = new Map<string, { lwpDays: number; paidOtMinutes: number; presentUnits: number }>();
    const bucket = (employeeId: string) => {
      const existing = byEmployee.get(employeeId);
      if (existing) {
        return existing;
      }
      const fresh = { lwpDays: 0, paidOtMinutes: 0, presentUnits: 0 };
      byEmployee.set(employeeId, fresh);
      return fresh;
    };
    for (const signal of signals) {
      const entry = bucket(signal.employeeId);
      if (signal.signalType === "LEAVE_DEBIT") {
        entry.lwpDays += signal.units;
      } else if (signal.signalType === "LEAVE_REVERSAL") {
        entry.lwpDays -= signal.units;
      } else if (signal.signalType === "OVERTIME") {
        entry.paidOtMinutes += signal.units;
      }
    }
    for (const record of attendance) {
      const entry = bucket(record.employeeId);
      entry.presentUnits += presentUnitsOf(record.status);
    }
    const rows: PayrollAttendanceFeedRow[] = [];
    for (const [employeeId, totals] of byEmployee) {
      const existing = this.repository.findFeedRow(actor, payPeriod, employeeId);
      const row: PayrollAttendanceFeedRow = {
        id: existing?.id ?? nextId("payroll-feed", this.repository.countFeedRows()),
        tenantId: actor.tenantId,
        entityId: actor.entityId,
        payPeriod,
        employeeId,
        lwpDays: Math.max(totals.lwpDays, 0),
        halfPayDays: 0,
        paidOtMinutes: totals.paidOtMinutes,
        presentUnits: totals.presentUnits,
        encashmentAmount: 0,
        exportStatus: "PENDING",
        isLocked: false,
      };
      this.repository.saveFeedRow(row);
      rows.push({ ...row });
    }
    this.audit.recordMutation(actor, { action: "G03_PAYROLL_FEED_GENERATE", subjectRef: `payroll_attendance_feed:${payPeriod}`, metadata: { payPeriod, rowCount: rows.length } });
    return rows;
  }

  /**
   * FR-17: export + lock a feed period (JOB-M05-LOCK). Locked rows become immutable —
   * every later correction is emitted as a payroll_feed_adjustments row (R6).
   */
  lockPayrollFeedPeriod(actor: ActorContext, payPeriod: string): { payPeriod: string; lockedRows: number } {
    this.authorization.check(actor, "g03.payroll.feed.lock", actor);
    this.assertFeedPeriodOpen(actor, payPeriod);
    const lockedRows = this.repository.lockFeedPeriod(actor, payPeriod);
    this.audit.recordMutation(actor, { action: "G03_PAYROLL_FEED_LOCK", subjectRef: `payroll_attendance_feed:${payPeriod}`, metadata: { payPeriod, lockedRows } });
    return { payPeriod, lockedRows };
  }

  listPayrollFeed(scope: TenantScope, payPeriod?: string): PayrollAttendanceFeedRow[] {
    requireTenantScope(scope);
    return this.repository.listFeedRows(scope, payPeriod).map((row) => ({ ...row }));
  }

  listPayrollFeedAdjustments(scope: TenantScope): PayrollFeedAdjustment[] {
    requireTenantScope(scope);
    return this.repository.listFeedAdjustments(scope).map((adjustment) => ({ ...adjustment }));
  }

  reject(actor: ActorContext, leaveApplicationId: string): { application: LeaveApplication; action: WorkflowAction; balance: LeaveBalance } {
    this.authorization.check(actor, "g03.leave.reject", actor);
    const application = this.requireApplication(actor, leaveApplicationId);
    if (application.status !== "SUBMITTED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only submitted leave can be rejected");
    }
    const action = this.workflow.actOnInstance(actor, { instanceId: application.workflowInstanceId, action: "REJECT" });
    const balance = this.getOrCreateBalance(actor, application.employeeId, application.leaveTypeId, yearOf(application.fromDate));
    balance.reserved -= application.totalDays;
    balance.availableBalance = balance.currentBalance - balance.reserved - balance.debited;
    balance.version += 1;
    this.repository.saveBalance(balance);
    this.repository.appendLedgerEntry({
      id: nextId("leave-ledger", this.repository.countLedgerEntries()),
      employeeId: application.employeeId,
      leaveApplicationId: application.id,
      entryType: "RELEASE",
      units: application.totalDays,
      balanceAfter: balance.availableBalance,
    });
    application.status = "REJECTED";
    this.repository.updateApplication(application);
    this.audit.recordMutation(actor, { action: "G03_LEAVE_REJECT", subjectRef: `g03_leave_applications:${application.id}`, metadata: { workflowActionId: action.id } });
    return { application: this.cloneApplication(application), action, balance: this.cloneBalance(balance) };
  }

  listApplications(scope: TenantScope): LeaveApplication[] {
    requireTenantScope(scope);
    return this.repository.listApplications(scope).map((item) => this.cloneApplication(item));
  }

  /** Post-full-review-goal fix: had no ownership check at all — any `g03.leave.read` holder could
   *  read any employee's leave balance via the `employeeId` query param. Self-or-override only. */
  getBalance(actor: ActorContext, employeeId: string, leaveTypeId = "EL", leaveYear = 2026): LeaveBalance {
    this.assertSelfOrLeaveReadOverride(actor, employeeId);
    return this.cloneBalance(this.getOrCreateBalance(actor, employeeId, leaveTypeId, leaveYear));
  }

  private isLeaveReadOverride(actor: ActorContext): boolean {
    return Boolean(actor.permissions?.includes("*") || actor.roles?.some((role) => LEAVE_READ_OVERRIDE_ROLES.has(role)));
  }

  /** Self, an org-wide override role, or the employee's own real resolved reporting-chain
   *  manager (e.g. checking a report's balance right after deciding their leave application) may
   *  read — never an arbitrary `g03.leave.read` holder. */
  private assertSelfOrLeaveReadOverride(actor: ActorContext, employeeId: string): void {
    if (this.isLeaveReadOverride(actor) || actor.userId === employeeId) {
      return;
    }
    const resolution = this.authorityResolution.resolve(actor, { mechanism: "REPORTING_CHAIN", subjectEmployeeId: employeeId }, "2026-01-01");
    if (resolution.selectedAssignees.some((assignee) => assignee.employeeId === actor.userId)) {
      return;
    }
    throw new FoundationError("FORBIDDEN", "You may only access your own leave records or those of your direct reports", { field: "employeeId" });
  }

  /** Self-service "view my attendance summary" (G14 personal dashboard): own attendance records
   *  only, self-or-override gated. */
  listMyAttendance(actor: ActorContext, employeeId: string): AttendanceRecord[] {
    this.assertSelfOrLeaveReadOverride(actor, employeeId);
    return this.repository.listAttendance(actor).filter((record) => record.employeeId === employeeId).map((record) => ({ ...record }));
  }

  listOutbox(scope: TenantScope): LeaveSrOutboxEvent[] {
    requireTenantScope(scope);
    const leaveIds = new Set(this.listApplications(scope).map((item) => item.id));
    return this.leaveSrRelay.list(scope).filter((item) => leaveIds.has(item.leaveApplicationId));
  }

  listLedger(scope: TenantScope): LeaveLedgerEntry[] {
    requireTenantScope(scope);
    const leaveIds = new Set(this.listApplications(scope).map((item) => item.id));
    return this.repository.listLedgerEntries().filter((item) => leaveIds.has(item.leaveApplicationId)).map((item) => ({ ...item }));
  }

  listAttendance(scope: TenantScope): AttendanceRecord[] {
    requireTenantScope(scope);
    return this.repository.listAttendance(scope).map((record) => ({ ...record }));
  }

  listPayrollSignals(scope: TenantScope): PayrollSignal[] {
    requireTenantScope(scope);
    const employeeIds = new Set(this.employeeMaster.list(scope).map((employee) => employee.id));
    return this.repository.listPayrollSignals().filter((signal) => employeeIds.has(signal.employeeId)).map((signal) => ({ ...signal }));
  }

  /** FR-10: create or replace a leave type (with its accrual policy) in the tenant catalog. */
  configureLeaveType(
    actor: ActorContext,
    input: {
      leaveTypeId: string;
      name: string;
      countsHolidays: boolean;
      openingBalance: number;
      accrualPolicy: { frequency: "MONTHLY" | "HALF_YEARLY" | "YEARLY"; unitsPerPeriod: number };
      eligibility?: { minServiceMonths: number };
      entitlementCapDays?: number;
      requiresFinalSanction?: boolean;
    }
  ): LeaveTypeConfig {
    this.authorization.check(actor, "g03.leave.configure", actor);
    if (!input.leaveTypeId || input.openingBalance < 0 || input.accrualPolicy.unitsPerPeriod < 0) {
      throw new FoundationError("VALIDATION_FAILED", "Leave type configuration is invalid", { field: "leaveTypeId" });
    }
    const config: LeaveTypeConfig = {
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      leaveTypeId: input.leaveTypeId,
      name: input.name,
      countsHolidays: input.countsHolidays,
      openingBalance: input.openingBalance,
      accrualPolicy: { ...input.accrualPolicy },
      eligibility: input.eligibility ? { ...input.eligibility } : undefined,
      entitlementCapDays: input.entitlementCapDays,
      status: "ACTIVE",
      requiresFinalSanction: input.requiresFinalSanction,
    };
    this.repository.saveLeaveType(config);
    this.audit.recordMutation(actor, { action: "G03_LEAVE_TYPE_CONFIGURE", subjectRef: `leave_types:${config.leaveTypeId}`, metadata: { openingBalance: config.openingBalance } });
    return this.cloneLeaveType(config);
  }

  listLeaveTypes(scope: TenantScope): LeaveTypeConfig[] {
    requireTenantScope(scope);
    return this.repository.listLeaveTypes(scope).map((config) => this.cloneLeaveType(config));
  }

  /** FR-02: register a holiday so non-holiday-counting leave types exclude it from totalDays. */
  addHoliday(actor: ActorContext, input: { holidayDate: string; name: string; calendarId?: string }): HolidayEntry {
    this.authorization.check(actor, "g03.holiday.configure", actor);
    if (!dateOnly(input.holidayDate)) {
      throw new FoundationError("VALIDATION_FAILED", "holidayDate must use YYYY-MM-DD", { field: "holidayDate" });
    }
    if (this.repository.listHolidays(actor).some((entry) => entry.holidayDate === input.holidayDate)) {
      throw new FoundationError("CONFLICT", "Holiday already exists for this date");
    }
    const entry: HolidayEntry = {
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      calendarId: input.calendarId ?? "default",
      holidayDate: input.holidayDate,
      name: input.name,
    };
    this.repository.saveHoliday(entry);
    this.audit.recordMutation(actor, { action: "G03_HOLIDAY_ADD", subjectRef: `holidays:${entry.holidayDate}`, metadata: { calendarId: entry.calendarId } });
    return { ...entry };
  }

  listHolidays(scope: TenantScope): HolidayEntry[] {
    requireTenantScope(scope);
    return this.repository.listHolidays(scope).map((entry) => ({ ...entry }));
  }

  private requireEmployee(scope: TenantScope, employeeId: string): void {
    if (!this.employeeMaster.getById(scope, employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
  }

  private requireApplication(scope: TenantScope, leaveApplicationId: string): LeaveApplication {
    const application = this.repository.findApplication(scope, leaveApplicationId);
    if (!application) {
      throw new FoundationError("NOT_FOUND", "Leave application not found");
    }
    return application;
  }

  private requireOutbox(scope: TenantScope, outboxEventId: string): LeaveSrOutboxEvent {
    const outbox = this.leaveSrRelay.list(scope).find((item) => item.id === outboxEventId);
    if (!outbox) {
      throw new FoundationError("NOT_FOUND", "G04 outbox event not found");
    }
    return outbox;
  }

  private requireAttendance(scope: TenantScope, attendanceId: string): AttendanceRecord {
    const attendance = this.repository.findAttendance(scope, attendanceId);
    if (!attendance) {
      throw new FoundationError("NOT_FOUND", "Attendance record not found");
    }
    return attendance;
  }

  /**
   * FR-04 status derivation. Precedence: FR-02 holiday calendar → approved leave spell →
   * punch completeness (short span = HALF_DAY, both punches = PRESENT, one punch = ANOMALY
   * with a missing-punch code, no punches = ABSENT). Callers never pass a status.
   */
  private deriveDayStatus(
    scope: TenantScope,
    input: { employeeId: string; attendanceDate: string; inTime?: string; outTime?: string }
  ): { status: AttendanceDayStatus; anomalyCode?: "MISSING_IN" | "MISSING_OUT" } {
    if (this.repository.listHolidays(scope).some((entry) => entry.holidayDate === input.attendanceDate)) {
      return { status: "HOLIDAY" };
    }
    const onApprovedLeave = this.repository
      .listApplications(scope)
      .some((application) => application.employeeId === input.employeeId && application.status === "APPROVED" && application.fromDate <= input.attendanceDate && input.attendanceDate <= application.toDate);
    if (onApprovedLeave) {
      return { status: "ON_LEAVE" };
    }
    if (input.inTime && input.outTime) {
      const worked = minutesBetween(input.inTime, input.outTime);
      return { status: worked < this.policy.halfDayUnderMinutes ? "HALF_DAY" : "PRESENT" };
    }
    if (!input.inTime && !input.outTime) {
      return { status: "ABSENT" };
    }
    return { status: "ANOMALY", anomalyCode: input.inTime ? "MISSING_OUT" : "MISSING_IN" };
  }

  /** FR-17 lock guard: any direct write into a locked feed period raises PERIOD_ALREADY_LOCKED. */
  private assertFeedPeriodOpen(scope: TenantScope, payPeriod: string): void {
    if (this.repository.isFeedPeriodLocked(scope, payPeriod)) {
      throw new FoundationError("PERIOD_ALREADY_LOCKED", "Payroll feed period is locked; corrections must go through feed adjustments", {
        field: "payPeriod",
        details: { payPeriod },
      });
    }
  }

  /**
   * R6 emission point: a signal targeting an OPEN period is appended for G10; a signal
   * targeting a LOCKED period never mutates the locked feed row — it is emitted as a
   * payroll_feed_adjustments row against the next open period (LOCKED_PERIOD_ADJUSTMENT_EMITTED).
   */
  private emitPayrollSignal(
    actor: ActorContext,
    input: { employeeId: string; period: string; signalType: PayrollSignal["signalType"]; sourceRef: string; units: number }
  ): { signal?: PayrollSignal; adjustment?: PayrollFeedAdjustment } {
    if (!this.repository.isFeedPeriodLocked(actor, input.period)) {
      const signal: PayrollSignal = {
        id: nextId("payroll-signal", this.repository.countPayrollSignals()),
        employeeId: input.employeeId,
        period: input.period,
        signalType: input.signalType,
        sourceRef: input.sourceRef,
        units: input.units,
        status: "READY_FOR_G10",
      };
      this.repository.appendPayrollSignal(signal);
      return { signal: { ...signal } };
    }
    const originalFeed = this.repository.findFeedRow(actor, input.period, input.employeeId);
    const adjustment: PayrollFeedAdjustment = {
      id: nextId("feed-adjustment", this.repository.countFeedAdjustments()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      originalFeedId: originalFeed?.id ?? `payroll_attendance_feed:${input.period}`,
      appliedInPayPeriod: this.nextOpenPeriod(actor, input.period),
      employeeId: input.employeeId,
      adjustmentType: adjustmentTypeOf(input.signalType),
      deltaValue: input.signalType === "LEAVE_REVERSAL" ? -input.units : input.units,
      reason: `Locked period ${input.period}: ${input.signalType} routed to next open period`,
      sourceRefType: adjustmentSourceOf(input.signalType),
      sourceRefId: input.sourceRef,
      status: "PENDING",
    };
    this.repository.appendFeedAdjustment(adjustment);
    this.audit.recordMutation(actor, {
      action: "LOCKED_PERIOD_ADJUSTMENT_EMITTED",
      subjectRef: `payroll_feed_adjustments:${adjustment.id}`,
      metadata: { lockedPeriod: input.period, appliedInPayPeriod: adjustment.appliedInPayPeriod, adjustmentType: adjustment.adjustmentType },
    });
    return { adjustment: { ...adjustment } };
  }

  private nextOpenPeriod(scope: TenantScope, payPeriod: string): string {
    let candidate = nextPeriod(payPeriod);
    let hops = 0;
    while (this.repository.isFeedPeriodLocked(scope, candidate)) {
      candidate = nextPeriod(candidate);
      hops += 1;
      if (hops > 120) {
        throw new FoundationError("INTERNAL", "No open payroll feed period found");
      }
    }
    return candidate;
  }

  private requireLeaveType(scope: TenantScope, leaveTypeId: string): LeaveTypeConfig {
    requireTenantScope(scope);
    const config = this.repository.findLeaveType(scope, leaveTypeId);
    if (!config || config.status !== "ACTIVE") {
      throw new FoundationError("VALIDATION_FAILED", "Unknown or inactive leave type", { field: "leaveTypeId", details: { leaveTypeId } });
    }
    return config;
  }

  /** ELIGIBILITY_FAILED gate: completed service (months, as of the leave start) vs the type's minimum. */
  private assertEligibility(scope: TenantScope, employeeId: string, config: LeaveTypeConfig, asOfDate: string): void {
    const minServiceMonths = config.eligibility?.minServiceMonths ?? 0;
    if (minServiceMonths <= 0) {
      return;
    }
    const employee = this.employeeMaster.getById(scope, employeeId);
    const serviceMonths = employee?.dateOfJoining ? monthsBetween(employee.dateOfJoining, asOfDate) : 0;
    if (serviceMonths < minServiceMonths) {
      throw new FoundationError("ELIGIBILITY_FAILED", "Employee does not meet the minimum service requirement for this leave type", {
        field: "leaveTypeId",
        details: { minServiceMonths, serviceMonths },
      });
    }
  }

  /** LEAVE_OVERLAP gate: reject date-overlapping SUBMITTED/APPROVED spells of the same employee. */
  private assertNoOverlap(scope: TenantScope, employeeId: string, fromDate: string, toDate: string): void {
    const overlapping = this.repository
      .listApplications(scope)
      .find(
        (item) =>
          item.employeeId === employeeId &&
          (item.status === "SUBMITTED" || item.status === "APPROVED") &&
          item.fromDate <= toDate &&
          fromDate <= item.toDate
      );
    if (overlapping) {
      throw new FoundationError("LEAVE_OVERLAP", "Requested spell overlaps an existing leave application", {
        field: "fromDate",
        details: { conflictingApplicationId: overlapping.id, conflictingApplicationNo: overlapping.applicationNo },
      });
    }
  }

  /** FR-02: holiday-aware day count — holidays excluded unless the type counts them (sandwich). */
  private countLeaveDays(scope: TenantScope, fromDate: string, toDate: string, config: LeaveTypeConfig): number {
    const total = inclusiveDays(fromDate, toDate);
    if (config.countsHolidays) {
      return total;
    }
    const holidays = new Set(this.repository.listHolidays(scope).map((entry) => entry.holidayDate));
    let days = 0;
    for (let ts = Date.parse(`${fromDate}T00:00:00Z`); ts <= Date.parse(`${toDate}T00:00:00Z`); ts += 86_400_000) {
      if (!holidays.has(new Date(ts).toISOString().slice(0, 10))) {
        days += 1;
      }
    }
    return days;
  }

  /** OPTIMISTIC_LOCK_CONFLICT gate: balance mutations may assert the leave_balances.version they read. */
  private assertBalanceVersion(balance: LeaveBalance, expectedVersion?: number): void {
    if (expectedVersion !== undefined && balance.version !== expectedVersion) {
      throw new FoundationError("OPTIMISTIC_LOCK_CONFLICT", "Leave balance was modified concurrently; re-read and retry", {
        field: "expectedVersion",
        details: { expectedVersion, currentVersion: balance.version },
      });
    }
  }

  private getOrCreateBalance(scope: TenantScope, employeeId: string, leaveTypeId: string, leaveYear: number): LeaveBalance {
    requireTenantScope(scope);
    const existing = this.repository.findBalance(scope, employeeId, leaveTypeId, leaveYear);
    if (existing) {
      return existing;
    }
    const config = this.requireLeaveType(scope, leaveTypeId);
    const balance: LeaveBalance = {
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      employeeId,
      leaveTypeId,
      leaveYear,
      currentBalance: config.openingBalance,
      reserved: 0,
      debited: 0,
      availableBalance: config.openingBalance,
      version: 1,
    };
    this.repository.saveBalance(balance);
    return balance;
  }

  private cloneApplication(application: LeaveApplication): LeaveApplication {
    return { ...application, resolverEvidence: { ...application.resolverEvidence } };
  }

  private cloneBalance(balance: LeaveBalance): LeaveBalance {
    return { ...balance };
  }

  private cloneLeaveType(config: LeaveTypeConfig): LeaveTypeConfig {
    return {
      ...config,
      accrualPolicy: { ...config.accrualPolicy },
      eligibility: config.eligibility ? { ...config.eligibility } : undefined,
    };
  }

  private cloneOutbox(outbox: LeaveSrOutboxEvent): LeaveSrOutboxEvent {
    return { ...outbox, payload: { ...outbox.payload } };
  }
}

function inclusiveDays(fromDate: string, toDate: string): number {
  if (!dateOnly(fromDate) || !dateOnly(toDate)) {
    throw new FoundationError("VALIDATION_FAILED", "Leave dates must use YYYY-MM-DD", { field: "fromDate" });
  }
  if (toDate < fromDate) {
    throw new FoundationError("VALIDATION_FAILED", "Leave end date cannot be before start date", { field: "toDate" });
  }
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  return Math.floor((to - from) / 86_400_000) + 1;
}

function yearOf(date: string): number {
  return Number.parseInt(date.slice(0, 4), 10);
}

function periodOf(date: string): string {
  return date.slice(0, 7);
}

function dateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dayBefore(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Signed whole days from `fromDate` to `toDate` (positive when fromDate is in the past). */
function daysBetween(fromDate: string, toDate: string): number {
  if (!dateOnly(fromDate) || !dateOnly(toDate)) {
    throw new FoundationError("VALIDATION_FAILED", "Dates must use YYYY-MM-DD", { field: "attendanceDate" });
  }
  return Math.floor((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000);
}

function minutesBetween(inTime: string, outTime: string): number {
  const parse = (value: string): number => {
    if (!/^\d{2}:\d{2}$/.test(value)) {
      throw new FoundationError("VALIDATION_FAILED", "Punch times must use HH:MM", { field: "inTime" });
    }
    return Number.parseInt(value.slice(0, 2), 10) * 60 + Number.parseInt(value.slice(3, 5), 10);
  };
  return Math.max(parse(outTime) - parse(inTime), 0);
}

function nextPeriod(payPeriod: string): string {
  const year = Number.parseInt(payPeriod.slice(0, 4), 10);
  const month = Number.parseInt(payPeriod.slice(5, 7), 10);
  const rolled = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return `${rolled.year}-${String(rolled.month).padStart(2, "0")}`;
}

/** R2 present_units contribution of a derived day status (present-counting fractions). */
function presentUnitsOf(status: AttendanceDayStatus): number {
  if (status === "PRESENT" || status === "REGULARISED" || status === "ON_LEAVE") {
    return 1;
  }
  if (status === "HALF_DAY") {
    return 0.5;
  }
  return 0;
}

function adjustmentTypeOf(signalType: PayrollSignal["signalType"]): PayrollFeedAdjustment["adjustmentType"] {
  if (signalType === "OVERTIME") {
    return "OT_DELTA";
  }
  if (signalType === "ATTENDANCE_REGULARISED") {
    return "PRESENT_DELTA";
  }
  return "LWP_DELTA";
}

function adjustmentSourceOf(signalType: PayrollSignal["signalType"]): PayrollFeedAdjustment["sourceRefType"] {
  if (signalType === "ATTENDANCE_REGULARISED") {
    return "REGULARISATION";
  }
  if (signalType === "LEAVE_REVERSAL") {
    return "LEAVE_CANCEL";
  }
  return "MANUAL";
}

function monthsBetween(fromDate: string, toDate: string): number {
  if (!dateOnly(fromDate) || !dateOnly(toDate) || toDate < fromDate) {
    return 0;
  }
  const from = { year: Number.parseInt(fromDate.slice(0, 4), 10), month: Number.parseInt(fromDate.slice(5, 7), 10), day: Number.parseInt(fromDate.slice(8, 10), 10) };
  const to = { year: Number.parseInt(toDate.slice(0, 4), 10), month: Number.parseInt(toDate.slice(5, 7), 10), day: Number.parseInt(toDate.slice(8, 10), 10) };
  let months = (to.year - from.year) * 12 + (to.month - from.month);
  if (to.day < from.day) {
    months -= 1;
  }
  return Math.max(months, 0);
}
