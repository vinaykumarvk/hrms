import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { WorkflowAction, WorkflowInstance, HrmsWorkflowService } from "../../platform/workflow/hrmsWorkflowService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { LeaveSrOutboxEvent, LeaveSrRelayService } from "../g04/leaveSrRelayService";
import { JobRun, JobService } from "../../jobs/jobService";

export type LeaveApplicationStatus = "SUBMITTED" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "CANCELLED";

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
  private readonly applications: LeaveApplication[] = [];
  private readonly balances: LeaveBalance[] = [];
  private readonly ledger: LeaveLedgerEntry[] = [];
  private readonly attendance: AttendanceRecord[] = [];
  private readonly payrollSignals: PayrollSignal[] = [];

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly workflow: HrmsWorkflowService,
    private readonly leaveSrRelay: LeaveSrRelayService,
    private readonly jobs: JobService,
    private readonly notifications: NotificationService
  ) {}

  submit(
    actor: ActorContext,
    input: { employeeId: string; leaveTypeId: string; fromDate: string; toDate: string; reason?: string }
  ): { application: LeaveApplication; workflow: { instance: WorkflowInstance; taskId: string }; balance: LeaveBalance } {
    this.authorization.check(actor, "g03.leave.submit", actor);
    this.requireEmployee(actor, input.employeeId);
    const totalDays = inclusiveDays(input.fromDate, input.toDate);
    const balance = this.getOrCreateBalance(actor, input.employeeId, input.leaveTypeId, yearOf(input.fromDate));
    if (balance.availableBalance < totalDays) {
      throw new FoundationError("CONFLICT", "Leave balance is insufficient", { details: { availableBalance: balance.availableBalance, requested: totalDays } });
    }
    const applicationId = nextId("leave-app", this.applications.length);
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
    this.ledger.push({
      id: nextId("leave-ledger", this.ledger.length),
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
      applicationNo: `LA/${yearOf(input.fromDate)}/${String(this.applications.length + 1).padStart(5, "0")}`,
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
    this.applications.push(application);
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

  approve(actor: ActorContext, leaveApplicationId: string, idempotencyKey: string): LeaveApprovalResult {
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
    const action = this.workflow.actOnInstance(actor, { instanceId: application.workflowInstanceId, action: "APPROVE" });
    const balance = this.getOrCreateBalance(actor, application.employeeId, application.leaveTypeId, yearOf(application.fromDate));
    balance.reserved -= application.totalDays;
    balance.debited += application.totalDays;
    balance.availableBalance = balance.currentBalance - balance.reserved - balance.debited;
    balance.version += 1;
    this.ledger.push({
      id: nextId("leave-ledger", this.ledger.length),
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

  cancelApproved(actor: ActorContext, leaveApplicationId: string, idempotencyKey: string, cancelDate: string): LeaveApprovalResult {
    this.authorization.check(actor, "g03.leave.cancel", actor);
    const application = this.requireApplication(actor, leaveApplicationId);
    if (application.status !== "APPROVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only approved leave can be cancelled");
    }
    const action = this.workflow.actOnInstance(actor, { instanceId: application.workflowInstanceId, action: "CANCEL" });
    const balance = this.getOrCreateBalance(actor, application.employeeId, application.leaveTypeId, yearOf(application.fromDate));
    balance.debited -= application.totalDays;
    balance.availableBalance = balance.currentBalance - balance.reserved - balance.debited;
    balance.version += 1;
    this.ledger.push({
      id: nextId("leave-ledger", this.ledger.length),
      employeeId: application.employeeId,
      leaveApplicationId: application.id,
      entryType: "CANCELLATION_CREDIT",
      units: application.totalDays,
      balanceAfter: balance.availableBalance,
    });
    application.status = "CANCELLED";
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

  accrue(actor: ActorContext, input: { employeeId: string; leaveTypeId: string; leaveYear: number; units: number; effectiveDate: string }): LeaveBalance {
    this.authorization.check(actor, "g03.leave.accrue", actor);
    const balance = this.getOrCreateBalance(actor, input.employeeId, input.leaveTypeId, input.leaveYear);
    balance.currentBalance += input.units;
    balance.availableBalance = balance.currentBalance - balance.reserved - balance.debited;
    balance.version += 1;
    this.ledger.push({
      id: nextId("leave-ledger", this.ledger.length),
      employeeId: input.employeeId,
      leaveApplicationId: `accrual:${input.effectiveDate}`,
      entryType: "ACCRUAL",
      units: input.units,
      balanceAfter: balance.availableBalance,
    });
    this.audit.recordMutation(actor, { action: "G03_LEAVE_ACCRUAL", subjectRef: `employees:${input.employeeId}`, metadata: { units: input.units } });
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
    this.ledger.push({
      id: nextId("leave-ledger", this.ledger.length),
      employeeId: application.employeeId,
      leaveApplicationId: application.id,
      entryType: "RELEASE",
      units: application.totalDays,
      balanceAfter: balance.availableBalance,
    });
    application.status = "REJECTED";
    this.audit.recordMutation(actor, { action: "G03_LEAVE_REJECT", subjectRef: `g03_leave_applications:${application.id}`, metadata: { workflowActionId: action.id } });
    return { application: this.cloneApplication(application), action, balance: this.cloneBalance(balance) };
  }

  listApplications(scope: TenantScope): LeaveApplication[] {
    requireTenantScope(scope);
    return this.applications.filter((item) => item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId)).map((item) => this.cloneApplication(item));
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
    return this.ledger.filter((item) => leaveIds.has(item.leaveApplicationId)).map((item) => ({ ...item }));
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

  private requireEmployee(scope: TenantScope, employeeId: string): void {
    if (!this.employeeMaster.getById(scope, employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
  }

  private requireApplication(scope: TenantScope, leaveApplicationId: string): LeaveApplication {
    const application = this.applications.find((item) => item.id === leaveApplicationId && item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId));
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

  private getOrCreateBalance(scope: TenantScope, employeeId: string, leaveTypeId: string, leaveYear: number): LeaveBalance {
    requireTenantScope(scope);
    const existing = this.balances.find(
      (item) =>
        item.tenantId === scope.tenantId &&
        (!scope.entityId || item.entityId === scope.entityId) &&
        item.employeeId === employeeId &&
        item.leaveTypeId === leaveTypeId &&
        item.leaveYear === leaveYear
    );
    if (existing) {
      return existing;
    }
    const balance: LeaveBalance = {
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      employeeId,
      leaveTypeId,
      leaveYear,
      currentBalance: 30,
      reserved: 0,
      debited: 0,
      availableBalance: 30,
      version: 1,
    };
    this.balances.push(balance);
    return balance;
  }

  private cloneApplication(application: LeaveApplication): LeaveApplication {
    return { ...application, resolverEvidence: { ...application.resolverEvidence } };
  }

  private cloneBalance(balance: LeaveBalance): LeaveBalance {
    return { ...balance };
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
