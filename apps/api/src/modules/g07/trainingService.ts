import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { HrmsWorkflowService } from "../../platform/workflow/hrmsWorkflowService";
import { ActorContext, FoundationError, TenantScope, nextId, pseudoHash64, requireTenantScope, stableStringify } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { ServiceRegisterService } from "../g12/serviceRegisterService";
import { DocumentVaultService } from "../g13/documentVaultService";

export type TrainingSessionStatus = "DRAFT" | "OPEN" | "FULL" | "COMPLETED" | "CANCELLED";
export type TrainingNominationStatus = "PENDING_L1" | "APPROVED" | "WAITLISTED" | "REJECTED" | "COMPLETED" | "NO_SHOW";
export type CertificationStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export interface TrainingSession {
  id: string;
  tenantId: string;
  entityId?: string;
  programCode: string;
  title: string;
  capacity: number;
  enrolled: number;
  status: TrainingSessionStatus;
}

export interface TrainingNomination {
  id: string;
  tenantId: string;
  entityId?: string;
  nominationNo: string;
  sessionId: string;
  employeeId: string;
  status: TrainingNominationStatus;
  workflowInstanceId: string;
  waitlistPosition?: number;
  certificationId?: string;
}

export interface Certification {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  sessionId: string;
  certificateNo: string;
  status: CertificationStatus;
  significantForSr: boolean;
  documentId: string;
  srEventId?: string;
}

export class TrainingService {
  private readonly sessions: TrainingSession[] = [];
  private readonly nominations: TrainingNomination[] = [];
  private readonly certifications: Certification[] = [];

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly workflow: HrmsWorkflowService,
    private readonly serviceRegister: ServiceRegisterService,
    private readonly documentVault: DocumentVaultService,
    private readonly notifications: NotificationService
  ) {}

  createSession(actor: ActorContext, input: { programCode: string; title: string; capacity: number }): TrainingSession {
    this.authorization.check(actor, "g07.training.session.write", actor);
    if (input.capacity < 1) {
      throw new FoundationError("VALIDATION_FAILED", "Training capacity must be positive", { field: "capacity" });
    }
    const session: TrainingSession = {
      id: nextId("training-session", this.sessions.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      programCode: input.programCode,
      title: input.title,
      capacity: input.capacity,
      enrolled: 0,
      status: "OPEN",
    };
    this.sessions.push(session);
    this.audit.recordMutation(actor, { action: "G07_SESSION_OPEN", subjectRef: `g07_training_sessions:${session.id}` });
    return { ...session };
  }

  nominate(actor: ActorContext, input: { sessionId: string; employeeId: string }): TrainingNomination {
    this.authorization.check(actor, "g07.nomination.submit", actor);
    const session = this.requireSession(actor, input.sessionId);
    if (session.status !== "OPEN" && session.status !== "FULL") {
      throw new FoundationError("PRECONDITION_FAILED", "Training session is not open for nominations");
    }
    if (!this.employeeMaster.getById(actor, input.employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    const started = this.workflow.start(actor, {
      workflowCode: "WF-G07-NOMINATION",
      subjectRef: `g07_training_nominations:${input.employeeId}:${session.id}`,
      stage: "PENDING_L1",
      resolverRule: { mechanism: "REPORTING_CHAIN", subjectEmployeeId: input.employeeId },
      asOf: "2026-07-02",
    });
    const nomination: TrainingNomination = {
      id: nextId("training-nomination", this.nominations.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      nominationNo: `TN/${String(this.nominations.length + 1).padStart(5, "0")}`,
      sessionId: session.id,
      employeeId: input.employeeId,
      status: "PENDING_L1",
      workflowInstanceId: started.instance.id,
    };
    this.nominations.push(nomination);
    this.audit.recordMutation(actor, { action: "G07_NOMINATION_SUBMITTED", subjectRef: `g07_training_nominations:${nomination.id}`, metadata: { workflowCode: "WF-G07-NOMINATION" } });
    return { ...nomination };
  }

  approveNomination(actor: ActorContext, nominationId: string): TrainingNomination {
    this.authorization.check(actor, "g07.nomination.approve", actor);
    const nomination = this.requireNomination(actor, nominationId);
    const session = this.requireSession(actor, nomination.sessionId);
    if (nomination.status !== "PENDING_L1") {
      throw new FoundationError("PRECONDITION_FAILED", "Only pending nominations can be approved");
    }
    this.workflow.actOnInstance(actor, { instanceId: nomination.workflowInstanceId, action: "APPROVE" });
    if (session.enrolled >= session.capacity) {
      nomination.status = "WAITLISTED";
      nomination.waitlistPosition = this.nominations.filter((item) => item.sessionId === session.id && item.status === "WAITLISTED").length + 1;
      session.status = "FULL";
      this.audit.recordMutation(actor, { action: "G07_NOMINATION_WAITLISTED", subjectRef: `g07_training_nominations:${nomination.id}` });
      return { ...nomination };
    }
    session.enrolled += 1;
    session.status = session.enrolled >= session.capacity ? "FULL" : "OPEN";
    nomination.status = "APPROVED";
    this.audit.recordMutation(actor, { action: "G07_NOMINATION_APPROVED", subjectRef: `g07_training_nominations:${nomination.id}` });
    return { ...nomination };
  }

  completeNomination(
    actor: ActorContext,
    nominationId: string,
    input: { passed: boolean; significantForSr: boolean; completionDate: string; idempotencyKey: string }
  ): { nomination: TrainingNomination; certification?: Certification } {
    this.authorization.check(actor, "g07.nomination.complete", actor);
    const nomination = this.requireNomination(actor, nominationId);
    const session = this.requireSession(actor, nomination.sessionId);
    if (nomination.status !== "APPROVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only approved nominations can be completed");
    }
    if (!input.passed) {
      nomination.status = "NO_SHOW";
      this.audit.recordMutation(actor, { action: "G07_NOMINATION_NO_SHOW", subjectRef: `g07_training_nominations:${nomination.id}` });
      return { nomination: { ...nomination } };
    }
    const document = this.documentVault.createDocument(actor, {
      title: `Training Certificate ${session.programCode}`,
      ownerEmployeeId: nomination.employeeId,
      classification: "INTERNAL",
      contentHash: pseudoHash64(stableStringify({ nominationId, programCode: session.programCode, completionDate: input.completionDate })),
      isWorm: true,
    });
    const attached = this.documentVault.attach(actor, document.id, {
      moduleCode: "G07",
      entityName: "training_certifications",
      entityRefId: nomination.id,
      linkRole: "CERTIFICATE",
    });
    const certification: Certification = {
      id: nextId("certification", this.certifications.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: nomination.employeeId,
      sessionId: session.id,
      certificateNo: `CERT/${String(this.certifications.length + 1).padStart(5, "0")}`,
      status: "ACTIVE",
      significantForSr: input.significantForSr,
      documentId: attached.id,
    };
    if (input.significantForSr) {
      const sr = this.serviceRegister.ingest(actor, input.idempotencyKey, {
        sourceModule: "G07",
        sourceReferenceId: `g07_certifications:${certification.id}:POSTED`,
        sourceEventVersion: 1,
        employeeId: certification.employeeId,
        eventTypeCode: "TRAINING_CERTIFICATION_POSTED",
        eventDate: input.completionDate,
        factKey: `G07:${certification.id}:TRAINING_CERTIFICATION_POSTED`,
        payload: { programCode: session.programCode, certificateNo: certification.certificateNo },
        documentIds: [attached.id],
      });
      certification.srEventId = sr.event.id;
    }
    this.certifications.push(certification);
    nomination.status = "COMPLETED";
    nomination.certificationId = certification.id;
    this.audit.recordMutation(actor, {
      action: "G07_TRAINING_COMPLETED",
      subjectRef: `g07_training_nominations:${nomination.id}`,
      metadata: { marker: "TRAINING_CERTIFICATION_POSTED", significantForSr: input.significantForSr, srEventId: certification.srEventId },
    });
    return { nomination: { ...nomination }, certification: { ...certification } };
  }

  summary(scope: TenantScope): { sessions: number; approved: number; completed: number; srPosted: number } {
    requireTenantScope(scope);
    return {
      sessions: this.sessions.filter((session) => this.inScope(session, scope)).length,
      approved: this.nominations.filter((nomination) => this.inScope(nomination, scope) && nomination.status === "APPROVED").length,
      completed: this.nominations.filter((nomination) => this.inScope(nomination, scope) && nomination.status === "COMPLETED").length,
      srPosted: this.certifications.filter((certification) => this.inScope(certification, scope) && Boolean(certification.srEventId)).length,
    };
  }

  private requireSession(scope: TenantScope, sessionId: string): TrainingSession {
    const session = this.sessions.find((item) => item.id === sessionId && this.inScope(item, scope));
    if (!session) {
      throw new FoundationError("NOT_FOUND", "Training session not found");
    }
    return session;
  }

  private requireNomination(scope: TenantScope, nominationId: string): TrainingNomination {
    const nomination = this.nominations.find((item) => item.id === nominationId && this.inScope(item, scope));
    if (!nomination) {
      throw new FoundationError("NOT_FOUND", "Training nomination not found");
    }
    return nomination;
  }

  private inScope(row: { tenantId: string; entityId?: string }, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId);
  }
}
