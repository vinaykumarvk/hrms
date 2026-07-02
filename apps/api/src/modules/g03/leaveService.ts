import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { WorkflowAction, WorkflowInstance, HrmsWorkflowService } from "../../platform/workflow/hrmsWorkflowService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { LeaveSrOutboxEvent, LeaveSrRelayService } from "../g04/leaveSrRelayService";
import { JobRun, JobService } from "../../jobs/jobService";
import { LeaveRepository } from "./leaveRepository";

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

export interface AttendanceRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  attendanceDate: string;
  inTime?: string;
  outTime?: string;
  status: "PRESENT" | "ANOMALY" | "REGULARISED";
  anomalyCode?: "MISSING_IN" | "MISSING_OUT";
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

export class LeaveService {
  private readonly attendance: AttendanceRecord[] = [];
  private readonly payrollSignals: PayrollSignal[] = [];

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly workflow: HrmsWorkflowService,
    private readonly leaveSrRelay: LeaveSrRelayService,
    private readonly jobs: JobService,
    private readonly notifications: NotificationService,
    private readonly repository: LeaveRepository
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
    });
    const postedOutbox = this.leaveSrRelay.relayEvent(actor, readyOutbox.id);
    application.srEventId = postedOutbox.srEventId;
    application.g04OutboxEventId = postedOutbox.id;
    this.repository.updateApplication(application);
    this.payrollSignals.push({
      id: nextId("payroll-signal", this.payrollSignals.length),
      employeeId: application.employeeId,
      period: periodOf(application.fromDate),
      signalType: "LEAVE_DEBIT",
      sourceRef: `g03_leave_applications:${application.id}`,
      units: application.totalDays,
      status: "READY_FOR_G10",
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
    });
    const postedOutbox = this.leaveSrRelay.relayEvent(actor, readyOutbox.id);
    this.payrollSignals.push({
      id: nextId("payroll-signal", this.payrollSignals.length),
      employeeId: application.employeeId,
      period: periodOf(cancelDate),
      signalType: "LEAVE_REVERSAL",
      sourceRef: `g03_leave_applications:${application.id}`,
      units: application.totalDays,
      status: "READY_FOR_G10",
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
    });
    const postedOutbox = this.leaveSrRelay.relayEvent(actor, readyOutbox.id);
    this.payrollSignals.push({
      id: nextId("payroll-signal", this.payrollSignals.length),
      employeeId: application.employeeId,
      period: periodOf(input.cancelFromDate),
      signalType: "LEAVE_REVERSAL",
      sourceRef: `g03_leave_applications:${application.id}`,
      units: cancelledDays,
      status: "READY_FOR_G10",
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

  captureAttendance(actor: ActorContext, input: { employeeId: string; attendanceDate: string; inTime?: string; outTime?: string }): AttendanceRecord {
    this.authorization.check(actor, "g03.attendance.capture", actor);
    this.requireEmployee(actor, input.employeeId);
    const status = input.inTime && input.outTime ? "PRESENT" : "ANOMALY";
    const record: AttendanceRecord = {
      id: nextId("attendance", this.attendance.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      attendanceDate: input.attendanceDate,
      inTime: input.inTime,
      outTime: input.outTime,
      status,
      anomalyCode: status === "ANOMALY" ? (input.inTime ? "MISSING_OUT" : "MISSING_IN") : undefined,
    };
    this.attendance.push(record);
    this.audit.recordMutation(actor, { action: "G03_ATTENDANCE_CAPTURE", subjectRef: `attendance:${record.id}`, metadata: { status: record.status } });
    return { ...record };
  }

  regulariseAttendance(actor: ActorContext, attendanceId: string, reason: string): { attendance: AttendanceRecord; job: JobRun; signal: PayrollSignal } {
    this.authorization.check(actor, "g03.attendance.regularise", actor);
    const attendance = this.requireAttendance(actor, attendanceId);
    attendance.status = "REGULARISED";
    attendance.anomalyCode = undefined;
    const run = this.jobs.start(actor, { jobId: "JOB-G03-ATTENDANCE-RECOMPUTE", runKey: attendance.id });
    const job = this.jobs.finish(actor, run.id, { rowsAffected: 1, outcomeDetail: { attendanceId: attendance.id, reason } });
    const signal: PayrollSignal = {
      id: nextId("payroll-signal", this.payrollSignals.length),
      employeeId: attendance.employeeId,
      period: periodOf(attendance.attendanceDate),
      signalType: "ATTENDANCE_REGULARISED",
      sourceRef: `attendance:${attendance.id}`,
      units: 1,
      status: "READY_FOR_G10",
    };
    this.payrollSignals.push(signal);
    this.audit.recordMutation(actor, { action: "G03_ATTENDANCE_REGULARISE", subjectRef: `attendance:${attendance.id}`, metadata: { jobRunId: job.id } });
    return { attendance: { ...attendance }, job, signal: { ...signal } };
  }

  recordOvertime(actor: ActorContext, input: { employeeId: string; attendanceDate: string; minutes: number }): PayrollSignal {
    this.authorization.check(actor, "g03.overtime.record", actor);
    if (input.minutes <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "Overtime minutes must be positive", { field: "minutes" });
    }
    const signal: PayrollSignal = {
      id: nextId("payroll-signal", this.payrollSignals.length),
      employeeId: input.employeeId,
      period: periodOf(input.attendanceDate),
      signalType: "OVERTIME",
      sourceRef: `overtime:${input.employeeId}:${input.attendanceDate}`,
      units: input.minutes,
      status: "READY_FOR_G10",
    };
    this.payrollSignals.push(signal);
    this.audit.recordMutation(actor, { action: "G03_OVERTIME_RECORD", subjectRef: signal.sourceRef, metadata: { minutes: input.minutes } });
    return { ...signal };
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

  getBalance(scope: TenantScope, employeeId: string, leaveTypeId = "EL", leaveYear = 2026): LeaveBalance {
    return this.cloneBalance(this.getOrCreateBalance(scope, employeeId, leaveTypeId, leaveYear));
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
    return this.attendance.filter((record) => record.tenantId === scope.tenantId && (!scope.entityId || record.entityId === scope.entityId)).map((record) => ({ ...record }));
  }

  listPayrollSignals(scope: TenantScope): PayrollSignal[] {
    requireTenantScope(scope);
    const employeeIds = new Set(this.employeeMaster.list(scope).map((employee) => employee.id));
    return this.payrollSignals.filter((signal) => employeeIds.has(signal.employeeId)).map((signal) => ({ ...signal }));
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
    const attendance = this.attendance.find((record) => record.id === attendanceId && record.tenantId === scope.tenantId && (!scope.entityId || record.entityId === scope.entityId));
    if (!attendance) {
      throw new FoundationError("NOT_FOUND", "Attendance record not found");
    }
    return attendance;
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
