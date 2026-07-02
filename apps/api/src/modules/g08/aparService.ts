import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { HrmsWorkflowService } from "../../platform/workflow/hrmsWorkflowService";
import { ActorContext, FoundationError, TenantScope, nextId, pseudoHash64, requireTenantScope, stableStringify } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { ServiceRegisterService } from "../g12/serviceRegisterService";
import { DocumentVaultService } from "../g13/documentVaultService";

export type AparStatus =
  | "GOALS_PENDING"
  | "SELF_APPRAISAL"
  | "RO_ASSESSMENT"
  | "RVO_REVIEW"
  | "AA_ACCEPTANCE"
  | "FINALISED"
  | "POSTED"
  | "DISCLOSURE"
  | "SEALED_COVER"
  | "WITHDRAWN";

export interface AparForm {
  id: string;
  tenantId: string;
  entityId?: string;
  formNo: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  status: AparStatus;
  reportingOfficerId: string;
  reviewingOfficerId: string;
  acceptingAuthorityId: string;
  workflowInstanceId?: string;
  grade?: string;
  sealedCover: boolean;
  g06FeedSuppressed: boolean;
  documentId?: string;
  srEventId?: string;
}

export class AparService {
  private readonly forms: AparForm[] = [];

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly workflow: HrmsWorkflowService,
    private readonly serviceRegister: ServiceRegisterService,
    private readonly documentVault: DocumentVaultService,
    private readonly notifications: NotificationService
  ) {}

  openForm(
    actor: ActorContext,
    input: { employeeId: string; periodStart: string; periodEnd: string; reportingOfficerId: string; reviewingOfficerId: string; acceptingAuthorityId: string; underCharge?: boolean }
  ): AparForm {
    this.authorization.check(actor, "g08.apar.form.open", actor);
    if (!this.employeeMaster.getById(actor, input.employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    const sealed = Boolean(input.underCharge);
    const started = sealed
      ? undefined
      : this.workflow.start(actor, {
          workflowCode: "WF-G08-APAR-SEQUENTIAL",
          subjectRef: `g08_apar_forms:${input.employeeId}:${input.periodStart}`,
          stage: "GOALS_PENDING",
          resolverRule: { mechanism: "REPORTING_CHAIN", subjectEmployeeId: input.employeeId },
          asOf: input.periodStart,
        });
    const form: AparForm = {
      id: nextId("apar-form", this.forms.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      formNo: `APAR/${input.periodStart.slice(0, 4)}/${String(this.forms.length + 1).padStart(5, "0")}`,
      employeeId: input.employeeId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: sealed ? "SEALED_COVER" : "GOALS_PENDING",
      reportingOfficerId: input.reportingOfficerId,
      reviewingOfficerId: input.reviewingOfficerId,
      acceptingAuthorityId: input.acceptingAuthorityId,
      workflowInstanceId: started?.instance.id,
      sealedCover: sealed,
      g06FeedSuppressed: sealed,
    };
    this.forms.push(form);
    this.audit.recordMutation(actor, {
      action: "G08_APAR_OPENED",
      subjectRef: `g08_apar_forms:${form.id}`,
      metadata: sealed ? { marker: "SEALED_COVER", feed: "G08_G06_FEED_SUPPRESSED" } : { workflowInstanceId: form.workflowInstanceId },
    });
    return { ...form };
  }

  submitSelf(actor: ActorContext, formId: string): AparForm {
    this.authorization.check(actor, "g08.apar.self.submit", actor);
    const form = this.requireForm(actor, formId);
    this.requireStatus(form, "GOALS_PENDING");
    form.status = "RO_ASSESSMENT";
    this.audit.recordMutation(actor, { action: "G08_SELF_SUBMITTED", subjectRef: `g08_apar_forms:${form.id}` });
    return { ...form };
  }

  recordReporting(actor: ActorContext, formId: string, input: { grade: string; narrative: string }): AparForm {
    this.authorization.check(actor, "g08.apar.report", actor);
    const form = this.requireForm(actor, formId);
    this.requireStatus(form, "RO_ASSESSMENT");
    if (!input.narrative) {
      throw new FoundationError("VALIDATION_FAILED", "Reporting narrative is required", { field: "narrative" });
    }
    form.grade = input.grade;
    form.status = "RVO_REVIEW";
    this.audit.recordMutation(actor, { action: "G08_RO_ASSESSMENT", subjectRef: `g08_apar_forms:${form.id}` });
    return { ...form };
  }

  recordReview(actor: ActorContext, formId: string, input: { concur: boolean; remarks: string }): AparForm {
    this.authorization.check(actor, "g08.apar.review", actor);
    const form = this.requireForm(actor, formId);
    this.requireStatus(form, "RVO_REVIEW");
    form.status = "AA_ACCEPTANCE";
    this.audit.recordMutation(actor, { action: "G08_RVO_REVIEW", subjectRef: `g08_apar_forms:${form.id}`, metadata: { concur: input.concur, remarks: input.remarks } });
    return { ...form };
  }

  accept(actor: ActorContext, formId: string, input: { finalGrade: string }): AparForm {
    this.authorization.check(actor, "g08.apar.accept", actor);
    const form = this.requireForm(actor, formId);
    this.requireStatus(form, "AA_ACCEPTANCE");
    const document = this.documentVault.createDocument(actor, {
      title: `Final APAR ${form.formNo}`,
      ownerEmployeeId: form.employeeId,
      classification: "SECRET",
      contentHash: pseudoHash64(stableStringify({ formNo: form.formNo, grade: input.finalGrade })),
      isWorm: true,
    });
    const attached = this.documentVault.attach(actor, document.id, {
      moduleCode: "G08",
      entityName: "apar_forms",
      entityRefId: form.id,
      linkRole: "FINAL_APAR",
    });
    form.grade = input.finalGrade;
    form.status = "FINALISED";
    form.documentId = attached.id;
    form.g06FeedSuppressed = false;
    this.audit.recordMutation(actor, { action: "G08_AA_ACCEPTANCE", subjectRef: `g08_apar_forms:${form.id}`, metadata: { documentId: attached.id } });
    return { ...form };
  }

  releaseSealedCover(actor: ActorContext, formId: string, input: { reason: string }): AparForm {
    this.authorization.check(actor, "g08.apar.sealed.release", actor);
    const form = this.requireForm(actor, formId);
    this.requireStatus(form, "SEALED_COVER");
    form.status = "DISCLOSURE";
    form.sealedCover = false;
    form.g06FeedSuppressed = false;
    this.audit.recordMutation(actor, { action: "G08_SEALED_COVER_RELEASED", subjectRef: `g08_apar_forms:${form.id}`, metadata: { reason: input.reason } });
    return { ...form };
  }

  postFinalGrade(actor: ActorContext, formId: string, input: { eventDate: string; idempotencyKey: string }): { form: AparForm; srEventId: string } {
    this.authorization.check(actor, "g08.apar.post_sr", actor);
    const form = this.requireForm(actor, formId);
    if (form.status !== "FINALISED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only finalised APAR forms can be posted to SR");
    }
    if (form.sealedCover || form.g06FeedSuppressed) {
      throw new FoundationError("PRECONDITION_FAILED", "SEALED_COVER suppresses APAR SR/G06 feed", { details: { marker: "G08_G06_FEED_SUPPRESSED" } });
    }
    const sr = this.serviceRegister.ingest(actor, input.idempotencyKey, {
      sourceModule: "G08",
      sourceReferenceId: `g08_apar_forms:${form.id}:FINAL_GRADE`,
      sourceEventVersion: 1,
      employeeId: form.employeeId,
      eventTypeCode: "APAR_FINAL_GRADE",
      eventDate: input.eventDate,
      factKey: `G08:${form.id}:APAR_FINAL_GRADE`,
      payload: { formNo: form.formNo, grade: form.grade, periodStart: form.periodStart, periodEnd: form.periodEnd },
      documentIds: [form.documentId ?? ""].filter((documentId) => documentId.length > 0),
    });
    form.status = "POSTED";
    form.srEventId = sr.event.id;
    this.notifications.publish(actor, { recipientEmployeeId: form.employeeId, messageId: "G08_APAR_POSTED", channel: "IN_APP", relatedRef: `g08_apar_forms:${form.id}`, mergeFields: { grade: form.grade ?? "" } });
    return { form: { ...form }, srEventId: sr.event.id };
  }

  summary(scope: TenantScope): { forms: number; posted: number; sealedCover: number; g06FeedSuppressed: number } {
    requireTenantScope(scope);
    const forms = this.forms.filter((form) => this.inScope(form, scope));
    return {
      forms: forms.length,
      posted: forms.filter((form) => form.status === "POSTED").length,
      sealedCover: forms.filter((form) => form.sealedCover).length,
      g06FeedSuppressed: forms.filter((form) => form.g06FeedSuppressed).length,
    };
  }

  private requireForm(scope: TenantScope, formId: string): AparForm {
    const form = this.forms.find((item) => item.id === formId && this.inScope(item, scope));
    if (!form) {
      throw new FoundationError("NOT_FOUND", "APAR form not found");
    }
    return form;
  }

  private requireStatus(form: AparForm, expected: AparStatus): void {
    if (form.status !== expected) {
      throw new FoundationError("PRECONDITION_FAILED", `APAR form must be ${expected}`);
    }
  }

  private inScope(row: { tenantId: string; entityId?: string }, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId);
  }
}
