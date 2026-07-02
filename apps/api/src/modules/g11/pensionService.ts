import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, pseudoHash64, requireTenantScope, stableStringify } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { PayrollService } from "../g10/payrollService";
import { ServiceRegisterService } from "../g12/serviceRegisterService";
import { DocumentVaultService } from "../g13/documentVaultService";

export type PensionCaseStatus = "DRAFT" | "SR_VERIFICATION" | "CALCULATION" | "PENDING_SANCTION" | "SANCTIONED" | "PPO_ISSUED" | "SETTLED" | "CLOSED" | "ON_HOLD";
export type PensionScheme = "OPS" | "NPS" | "UPS";

export interface ServiceVerification {
  srVerified: boolean;
  totalServiceMonths: number;
  penaltyExclusionMonths: number;
  qualifyingServiceMonths: number;
  status: "QUALIFYING_SERVICE_LOCKED";
  marker: "SR_VERIFICATION_GATE";
  penaltyMarker?: "G09_PENALTY_QS_EXCLUSION";
  provenanceMarker: "PROVENANCE_COMPLETE";
}

export interface PensionCalculationTrace {
  marker: "PENSION_CALC_TRACE";
  ruleVersion: string;
  lastPayDrawnTraceHash: string;
  formula: string;
  inputs: {
    lastBasicPayCents: number;
    qualifyingServiceMonths: number;
  };
}

export interface PensionCalculation {
  pensionCents: number;
  gratuityCents: number;
  commutationCents: number;
  trace: PensionCalculationTrace;
}

export interface PensionPpo {
  id: string;
  ppoNo: string;
  status: "PPO_ISSUED" | "ACTIVE" | "SUPERSEDED" | "CANCELLED";
  documentId: string;
  srEventIds: string[];
  marker: "PPO_ISSUED";
}

export interface PensionCase {
  id: string;
  tenantId: string;
  entityId?: string;
  caseNo: string;
  employeeId: string;
  separationDate: string;
  scheme: PensionScheme;
  status: PensionCaseStatus;
  makerUserId: string;
  sanctionedByUserId?: string;
  serviceVerification?: ServiceVerification;
  calculation?: PensionCalculation;
  ppo?: PensionPpo;
}

export interface PensionSummary {
  cases: number;
  serviceVerified: number;
  sanctioned: number;
  pposIssued: number;
  srPosted: number;
  serviceGateMarker: "SR_VERIFICATION_GATE";
  calculationMarker: "PENSION_CALC_TRACE";
  ppoMarker: "PPO_ISSUED";
}

export class PensionService {
  private readonly cases: PensionCase[] = [];

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly payroll: PayrollService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly serviceRegister: ServiceRegisterService,
    private readonly documentVault: DocumentVaultService
  ) {}

  createCase(actor: ActorContext, input: { employeeId: string; separationDate: string; scheme: PensionScheme }): PensionCase {
    this.authorization.check(actor, "g11.case.create", actor);
    if (!this.employeeMaster.getById(actor, input.employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    const pensionCase: PensionCase = {
      id: nextId("pension-case", this.cases.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      caseNo: `PEN/${input.separationDate.slice(0, 4)}/${String(this.cases.length + 1).padStart(5, "0")}`,
      employeeId: input.employeeId,
      separationDate: input.separationDate,
      scheme: input.scheme,
      status: "DRAFT",
      makerUserId: actor.userId,
    };
    this.cases.push(pensionCase);
    this.audit.recordMutation(actor, { action: "G11_CASE_CREATED", subjectRef: `g11_pension_cases:${pensionCase.id}`, metadata: { scheme: input.scheme } });
    return this.cloneCase(pensionCase);
  }

  verifyService(
    actor: ActorContext,
    caseId: string,
    input: { totalServiceMonths: number; penaltyExclusionMonths?: number; srCertified: boolean }
  ): PensionCase {
    this.authorization.check(actor, "g11.service.verify", actor);
    const pensionCase = this.requireCase(actor, caseId);
    if (!input.srCertified) {
      throw new FoundationError("PRECONDITION_FAILED", "SR_VERIFICATION_GATE requires certified Service Register facts", { details: { marker: "SR_VERIFICATION_GATE" } });
    }
    if (!Number.isInteger(input.totalServiceMonths) || input.totalServiceMonths <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "totalServiceMonths must be positive", { field: "totalServiceMonths" });
    }
    const penaltyExclusionMonths = input.penaltyExclusionMonths ?? 0;
    if (!Number.isInteger(penaltyExclusionMonths) || penaltyExclusionMonths < 0) {
      throw new FoundationError("VALIDATION_FAILED", "penaltyExclusionMonths must be non-negative", { field: "penaltyExclusionMonths" });
    }
    const qualifyingServiceMonths = Math.max(0, input.totalServiceMonths - penaltyExclusionMonths);
    pensionCase.status = "SR_VERIFICATION";
    pensionCase.serviceVerification = {
      srVerified: true,
      totalServiceMonths: input.totalServiceMonths,
      penaltyExclusionMonths,
      qualifyingServiceMonths,
      status: "QUALIFYING_SERVICE_LOCKED",
      marker: "SR_VERIFICATION_GATE",
      penaltyMarker: penaltyExclusionMonths > 0 ? "G09_PENALTY_QS_EXCLUSION" : undefined,
      provenanceMarker: "PROVENANCE_COMPLETE",
    };
    this.audit.recordMutation(actor, {
      action: "G11_SERVICE_VERIFIED",
      subjectRef: `g11_pension_cases:${pensionCase.id}`,
      metadata: {
        marker: "SR_VERIFICATION_GATE",
        lock: "QUALIFYING_SERVICE_LOCKED",
        penaltyMarker: pensionCase.serviceVerification.penaltyMarker,
        provenanceMarker: "PROVENANCE_COMPLETE",
      },
    });
    return this.cloneCase(pensionCase);
  }

  computeBenefits(actor: ActorContext, caseId: string, input: { ruleVersion: string }): PensionCase {
    this.authorization.check(actor, "g11.pension.compute", actor);
    const pensionCase = this.requireCase(actor, caseId);
    const verification = pensionCase.serviceVerification;
    if (!verification || !verification.srVerified || verification.status !== "QUALIFYING_SERVICE_LOCKED") {
      throw new FoundationError("PRECONDITION_FAILED", "QUALIFYING_SERVICE_LOCKED verification is required before pension calculation", { details: { marker: "SR_VERIFICATION_GATE" } });
    }
    const lastPay = this.payroll.getLastPayDrawn(actor, pensionCase.employeeId);
    const pensionCents = Math.round((lastPay.basicPayCents * verification.qualifyingServiceMonths) / 1320);
    const gratuityCents = Math.round((lastPay.basicPayCents * verification.qualifyingServiceMonths) / 66);
    const commutationCents = Math.round(pensionCents * 0.4) * 120;
    pensionCase.status = "PENDING_SANCTION";
    pensionCase.calculation = {
      pensionCents,
      gratuityCents,
      commutationCents,
      trace: {
        marker: "PENSION_CALC_TRACE",
        ruleVersion: input.ruleVersion,
        lastPayDrawnTraceHash: lastPay.traceHash,
        formula: "pension=basic*qualifyingMonths/1320;gratuity=basic*qualifyingMonths/66;commutation=40pctPension*120",
        inputs: {
          lastBasicPayCents: lastPay.basicPayCents,
          qualifyingServiceMonths: verification.qualifyingServiceMonths,
        },
      },
    };
    this.audit.recordMutation(actor, {
      action: "G11_PENSION_COMPUTED",
      subjectRef: `g11_pension_cases:${pensionCase.id}`,
      metadata: { marker: "PENSION_CALC_TRACE", lastPayMarker: lastPay.marker, ruleVersion: input.ruleVersion },
    });
    return this.cloneCase(pensionCase);
  }

  sanction(actor: ActorContext, caseId: string): PensionCase {
    this.authorization.check(actor, "g11.pension.sanction", actor);
    const pensionCase = this.requireCase(actor, caseId);
    if (pensionCase.makerUserId === actor.userId) {
      throw new FoundationError("PRECONDITION_FAILED", "PENSION_SOD blocks maker from sanctioning pension", { details: { marker: "PENSION_SOD" } });
    }
    if (!pensionCase.calculation) {
      throw new FoundationError("PRECONDITION_FAILED", "Pension calculation is required before sanction");
    }
    pensionCase.status = "SANCTIONED";
    pensionCase.sanctionedByUserId = actor.userId;
    this.audit.recordMutation(actor, { action: "G11_PENSION_SANCTIONED", subjectRef: `g11_pension_cases:${pensionCase.id}`, metadata: { marker: "PENSION_SOD" } });
    return this.cloneCase(pensionCase);
  }

  issuePpo(actor: ActorContext, caseId: string, input: { idempotencyKey: string }): PensionCase {
    this.authorization.check(actor, "g11.ppo.issue", actor);
    const pensionCase = this.requireCase(actor, caseId);
    if (pensionCase.status !== "SANCTIONED" || !pensionCase.calculation || !pensionCase.serviceVerification) {
      throw new FoundationError("PRECONDITION_FAILED", "Pension case must be sanctioned before PPO issue");
    }
    const contentHash = pseudoHash64(stableStringify({ caseNo: pensionCase.caseNo, calculation: pensionCase.calculation }));
    const document = this.documentVault.createDocument(actor, {
      title: `PPO ${pensionCase.caseNo}`,
      ownerEmployeeId: pensionCase.employeeId,
      classification: "CONFIDENTIAL",
      contentHash,
      isWorm: true,
    });
    const attached = this.documentVault.attach(actor, document.id, {
      moduleCode: "G11",
      entityName: "pension_cases",
      entityRefId: pensionCase.id,
      linkRole: "PPO",
    });
    const separation = this.serviceRegister.ingest(actor, `${input.idempotencyKey}:separation`, {
      sourceModule: "G11",
      sourceReferenceId: `g11_pension_cases:${pensionCase.id}:SEPARATION`,
      sourceEventVersion: 1,
      employeeId: pensionCase.employeeId,
      eventTypeCode: "SEPARATION_RECORDED",
      eventDate: pensionCase.separationDate,
      factKey: `G11:${pensionCase.id}:SEPARATION`,
      payload: { caseNo: pensionCase.caseNo, scheme: pensionCase.scheme, marker: "G11_SR_POSTED" },
      documentIds: [attached.id],
    });
    const ppoEvent = this.serviceRegister.ingest(actor, `${input.idempotencyKey}:ppo`, {
      sourceModule: "G11",
      sourceReferenceId: `g11_pension_cases:${pensionCase.id}:PPO`,
      sourceEventVersion: 1,
      employeeId: pensionCase.employeeId,
      eventTypeCode: "PPO_ISSUED",
      eventDate: pensionCase.separationDate,
      factKey: `G11:${pensionCase.id}:PPO_ISSUED`,
      orderNo: `PPO/${String(this.cases.length).padStart(5, "0")}`,
      payload: { caseNo: pensionCase.caseNo, pensionCents: pensionCase.calculation.pensionCents, marker: "G11_SR_POSTED" },
      documentIds: [attached.id],
    });
    pensionCase.status = "PPO_ISSUED";
    pensionCase.ppo = {
      id: nextId("ppo", this.cases.filter((item) => item.ppo).length),
      ppoNo: `PPO/${String(this.cases.filter((item) => item.ppo).length + 1).padStart(5, "0")}`,
      status: "PPO_ISSUED",
      documentId: attached.id,
      srEventIds: [separation.event.id, ppoEvent.event.id],
      marker: "PPO_ISSUED",
    };
    this.audit.recordMutation(actor, {
      action: "G11_PPO_ISSUED",
      subjectRef: `g11_pension_cases:${pensionCase.id}`,
      metadata: { marker: "PPO_ISSUED", srMarker: "G11_SR_POSTED", srEventIds: pensionCase.ppo.srEventIds },
    });
    return this.cloneCase(pensionCase);
  }

  summary(scope: TenantScope): PensionSummary {
    requireTenantScope(scope);
    const cases = this.cases.filter((pensionCase) => this.inScope(pensionCase, scope));
    return {
      cases: cases.length,
      serviceVerified: cases.filter((pensionCase) => pensionCase.serviceVerification?.status === "QUALIFYING_SERVICE_LOCKED").length,
      sanctioned: cases.filter((pensionCase) => pensionCase.status === "SANCTIONED" || pensionCase.status === "PPO_ISSUED" || pensionCase.status === "SETTLED" || pensionCase.status === "CLOSED").length,
      pposIssued: cases.filter((pensionCase) => pensionCase.ppo?.status === "PPO_ISSUED").length,
      srPosted: cases.reduce((total, pensionCase) => total + (pensionCase.ppo?.srEventIds.length ?? 0), 0),
      serviceGateMarker: "SR_VERIFICATION_GATE",
      calculationMarker: "PENSION_CALC_TRACE",
      ppoMarker: "PPO_ISSUED",
    };
  }

  private requireCase(scope: TenantScope, caseId: string): PensionCase {
    requireTenantScope(scope);
    const pensionCase = this.cases.find((item) => item.id === caseId && this.inScope(item, scope));
    if (!pensionCase) {
      throw new FoundationError("NOT_FOUND", "Pension case not found");
    }
    return pensionCase;
  }

  private inScope(row: { tenantId: string; entityId?: string }, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || !row.entityId || row.entityId === scope.entityId);
  }

  private cloneCase(pensionCase: PensionCase): PensionCase {
    return {
      ...pensionCase,
      serviceVerification: pensionCase.serviceVerification ? { ...pensionCase.serviceVerification } : undefined,
      calculation: pensionCase.calculation
        ? {
            ...pensionCase.calculation,
            trace: {
              ...pensionCase.calculation.trace,
              inputs: { ...pensionCase.calculation.trace.inputs },
            },
          }
        : undefined,
      ppo: pensionCase.ppo ? { ...pensionCase.ppo, srEventIds: [...pensionCase.ppo.srEventIds] } : undefined,
    };
  }
}
