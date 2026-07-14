import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";
import { EmployeeMasterService } from "./employeeMasterService";

/**
 * Post-hr_admin-goal thin build (`bgv_review` capability): view verification reports, vendor BGV
 * results, and discrepancy alerts. Modeled as a small satellite service matching the established
 * G01 pattern (nomineeService.ts/emergencyContactService.ts). `ActorContext` has no dedicated
 * "capability flag" field — only `roles`/`permissions`/`fieldGrants` — so the `bgv_review` flag
 * from the capability list is modeled as an additional role string (`bgv_reviewer`), consistent
 * with how every other fine-grained access decision in this codebase is represented.
 */

export type BgvVerificationType = "IDENTITY" | "ADDRESS" | "EMPLOYMENT_HISTORY" | "CRIMINAL" | "EDUCATION";
export type BgvStatus = "PENDING" | "CLEAR" | "DISCREPANCY_FOUND" | "FAILED";
export type BgvReviewOutcome = "ACCEPTED" | "ESCALATED" | "REJECTED";

export interface BgvRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  vendorName: string;
  verificationType: BgvVerificationType;
  status: BgvStatus;
  reportDate: string;
  discrepancyNotes?: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  reviewOutcome?: BgvReviewOutcome;
  reviewNotes?: string;
}

export interface BgvRepository {
  save(row: BgvRecord): void;
  find(scope: TenantScope, id: string): BgvRecord | undefined;
  listForEmployee(scope: TenantScope, employeeId: string): BgvRecord[];
}

export class InMemoryBgvRepository implements BgvRepository {
  private readonly rows: BgvRecord[] = [];
  private scoped(row: BgvRecord, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  save(row: BgvRecord): void {
    const i = this.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) this.rows[i] = { ...row };
    else this.rows.push({ ...row });
  }
  find(scope: TenantScope, id: string): BgvRecord | undefined {
    const row = this.rows.find((r) => r.id === id);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
  listForEmployee(scope: TenantScope, employeeId: string): BgvRecord[] {
    return this.rows.filter((r) => this.scoped(r, scope) && r.employeeId === employeeId).map((r) => ({ ...r }));
  }
}

export class BackgroundVerificationService {
  private counter = 0;

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: BgvRepository = new InMemoryBgvRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  private requireEmployee(scope: TenantScope, employeeId: string): void {
    if (!this.employeeMaster.getById(scope, employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found", { details: { employeeId } });
    }
  }

  /** Vendor/onboarding-desk records a verification report result (maker). */
  recordBgvResult(
    actor: ActorContext,
    input: { employeeId: string; vendorName: string; verificationType: BgvVerificationType; status: BgvStatus; reportDate: string; discrepancyNotes?: string }
  ): BgvRecord {
    this.authorization.check(actor, "g01.bgv.record", actor);
    this.requireEmployee(actor, input.employeeId);
    if (input.status === "DISCREPANCY_FOUND" && !input.discrepancyNotes?.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "A discrepancy result requires discrepancyNotes", { field: "discrepancyNotes" });
    }
    const record: BgvRecord = {
      id: this.next("bgv-record"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      vendorName: input.vendorName,
      verificationType: input.verificationType,
      status: input.status,
      reportDate: input.reportDate,
      discrepancyNotes: input.discrepancyNotes,
    };
    this.repo.save(record);
    this.audit.recordMutation(actor, {
      action: "G01_BGV_RESULT_RECORDED",
      subjectRef: `bgv_records:${record.id}`,
      metadata: { employeeId: record.employeeId, status: record.status, verificationType: record.verificationType },
    });
    return { ...record };
  }

  /**
   * hr_admin (holding the `bgv_reviewer` capability role, or an override) dispositions a
   * discrepancy result. `bgv_review` per the capability audit is view/triage — this method is the
   * one write action that "review discrepancy alerts" implies; only DISCREPANCY_FOUND records are
   * reviewable (a CLEAR/PENDING record has nothing to disposition).
   */
  reviewBgvResult(actor: ActorContext, id: string, input: { outcome: BgvReviewOutcome; notes: string }): BgvRecord {
    this.authorization.check(actor, "g01.bgv.review", actor);
    if (!actor.permissions?.includes("*") && !actor.roles?.some((role) => role === "bgv_reviewer" || role === "system")) {
      throw new FoundationError("FORBIDDEN", "Reviewing a BGV discrepancy requires the bgv_reviewer capability", { field: "actor" });
    }
    const record = this.repo.find(actor, id);
    if (!record) {
      throw new FoundationError("NOT_FOUND", "BGV record not found");
    }
    if (record.status !== "DISCREPANCY_FOUND") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a discrepancy result can be reviewed/dispositioned");
    }
    if (!input.notes?.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "Review notes are required", { field: "notes" });
    }
    record.reviewOutcome = input.outcome;
    record.reviewNotes = input.notes;
    record.reviewedByUserId = actor.userId;
    record.reviewedAt = new Date().toISOString();
    this.repo.save(record);
    this.audit.recordMutation(actor, {
      action: "G01_BGV_DISCREPANCY_REVIEWED",
      subjectRef: `bgv_records:${record.id}`,
      metadata: { employeeId: record.employeeId, outcome: input.outcome },
    });
    return { ...record };
  }

  /** View verification reports/vendor BGV results/discrepancy alerts for an employee. */
  listBgvRecords(actor: ActorContext, employeeId: string): BgvRecord[] {
    this.authorization.check(actor, "g01.bgv.read", actor);
    requireTenantScope(actor);
    return this.repo.listForEmployee(actor, employeeId);
  }
}
