import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, pseudoHash64, requireTenantScope, stableStringify } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { PayrollService } from "../g10/payrollService";
import { ServiceRegisterService } from "../g12/serviceRegisterService";
import { DocumentVaultService } from "../g13/documentVaultService";
import {
  G11BenefitOutcome,
  NpsBenefitEvent,
  PenPensionCalculation,
  PensionBenefitRepository,
  computeSchemeBenefit,
} from "./pensionBenefitRepository";
import { PensionRuleService } from "./pensionRuleService";

/** Post-hr_admin-goal SoD correction: hr_admin deliberately excluded. G11's own BRD (§55, and
 *  several FRs' "Primary Role(s)") names HR Admin alongside Pension Officer, but the platform's
 *  broader RBAC design explicitly carves pension out as a dedicated statutory-role boundary — see
 *  the hr_admin capability audit ("no direct grants in G06/G07/G09/G11... a deliberate
 *  separation-of-duties boundary"). That instruction supersedes the module BRD's older, looser
 *  language for this override set. */
const PENSION_ACCESS_OVERRIDE_ROLES = new Set(["pension_officer", "system"]);

function dateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Whole calendar months between two YYYY-MM-DD dates (never negative in the caller's use). */
function monthsBetween(fromDate: string, toDate: string): number {
  const [fromYear, fromMonth, fromDay] = fromDate.split("-").map((part) => Number.parseInt(part, 10));
  const [toYear, toMonth, toDay] = toDate.split("-").map((part) => Number.parseInt(part, 10));
  if (!fromYear || !fromMonth || !fromDay || !toYear || !toMonth || !toDay) {
    throw new FoundationError("VALIDATION_FAILED", "Dates must use YYYY-MM-DD", { field: "asOf" });
  }
  let months = (toYear - fromYear) * 12 + (toMonth - fromMonth);
  if (toDay < fromDay) {
    months -= 1;
  }
  return months;
}

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
  /** IR17: id of the E35 pen_pension_limit_rules row EFFECTIVE on the calculation date. */
  ruleVersionRef: string;
  lastPayDrawnTraceHash: string;
  formula: string;
  inputs: {
    lastBasicPayCents: number;
    qualifyingServiceMonths: number;
  };
}

export interface PensionCalculation {
  /** E07 pen_pension_calculations row id. */
  calculationId: string;
  scheme: PensionScheme;
  benefitOutcome: G11BenefitOutcome;
  pensionCents: number;
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

/** FR-G11-15 AC1: "estimators label results indicative/non-binding... and never write to the
 *  live case." This is the whole result shape — there is no case id because no case exists. */
export interface PensionEstimateResult {
  isBinding: false;
  employeeId: string;
  scheme: PensionScheme;
  asOf: string;
  qualifyingServiceMonths: number;
  emolumentsBaseCents: number;
  benefitOutcome: G11BenefitOutcome;
  pensionCents: number;
  formula: string;
  ruleVersionRef: string;
}

/** PH-15B FR-G11-12: fired ON PPO AUTHORISATION so the pensioner master is created from the PPO. */
export type PpoIssuedListener = (actor: ActorContext, pensionCase: PensionCase) => void;

export class PensionService {
  private readonly cases: PensionCase[] = [];
  private readonly ppoIssuedListeners: PpoIssuedListener[] = [];

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly payroll: PayrollService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly serviceRegister: ServiceRegisterService,
    private readonly documentVault: DocumentVaultService,
    private readonly pensionRules: PensionRuleService,
    private readonly benefitRepository: PensionBenefitRepository
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

  /**
   * PH-09C / BRD FR-G11-05 — scheme-BRANCHED pension calculation. The case scheme drives
   * distinct OPS / NPS / UPS / SERVICE_GRATUITY code paths in computeSchemeBenefit; the E35
   * pen_pension_limit_rules and E36 pen_rounding_rules rows are resolved as-of the
   * separation date (fail closed) and the E07 pen_pension_calculations row is persisted
   * with the rule-version FK (AC5 determinism). A benefit requested under the wrong scheme
   * fails with ERR-G11-SCHEME-MISMATCH — never a silent default.
   */
  computeBenefits(
    actor: ActorContext,
    caseId: string,
    input: { ruleVersion: string; asOf?: string; scheme?: PensionScheme; upsOptedIn?: boolean; npsEvent?: NpsBenefitEvent }
  ): PensionCase {
    this.authorization.check(actor, "g11.pension.compute", actor);
    const pensionCase = this.requireCase(actor, caseId);
    const verification = pensionCase.serviceVerification;
    if (!verification || !verification.srVerified || verification.status !== "QUALIFYING_SERVICE_LOCKED") {
      throw new FoundationError("PRECONDITION_FAILED", "QUALIFYING_SERVICE_LOCKED verification is required before pension calculation", { details: { marker: "SR_VERIFICATION_GATE" } });
    }
    if (input.scheme !== undefined && input.scheme !== pensionCase.scheme) {
      // FR-05 BR1: scheme comes from the case pension_scheme — cross-scheme requests fail.
      throw new FoundationError("ERR-G11-SCHEME-MISMATCH", `Benefit requested under ${input.scheme} but the case scheme is ${pensionCase.scheme}`, {
        field: "scheme",
        details: { requestedScheme: input.scheme, caseScheme: pensionCase.scheme },
      });
    }
    const asOf = input.asOf ?? pensionCase.separationDate;
    const limits = this.pensionRules.resolvePensionLimits(actor, asOf);
    const rounding = this.pensionRules.resolveRoundingRule(actor, asOf);
    const lastPay = this.payroll.getLastPayDrawn(actor, pensionCase.employeeId);
    const result = computeSchemeBenefit({
      scheme: pensionCase.scheme,
      qualifyingServiceMonths: verification.qualifyingServiceMonths,
      emolumentsBaseCents: lastPay.basicPayCents,
      avgEmoluments12mCents: lastPay.basicPayCents,
      limits,
      rounding,
      upsOptedIn: input.upsOptedIn,
      npsEvent: input.npsEvent,
    });
    // Recompute SUPERSEDES the prior E07 row (FR-05 data operations); history stays referenced.
    this.benefitRepository.supersedePensionCalculations(actor, pensionCase.id);
    const calculationRow: PenPensionCalculation = {
      id: nextId("pen-pension-calc", this.benefitRepository.countPensionCalculations()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      caseId: pensionCase.id,
      scheme: pensionCase.scheme,
      benefitOutcome: result.benefitOutcome,
      emolumentsBaseCents: lastPay.basicPayCents,
      emolumentsMethod: result.emolumentsMethod,
      avgEmolumentsCents: result.emolumentsMethod === "AVG_12_MONTH" ? lastPay.basicPayCents : undefined,
      qualifyingHalfYears: result.qualifyingHalfYears,
      pensionFractionBps: result.pensionFractionBps,
      basicPensionCents: result.basicPensionCents,
      minimumPensionApplied: result.minimumPensionApplied,
      maximumPensionCapApplied: result.maximumPensionCapApplied,
      upsAssuredPayoutCents: result.upsAssuredPayoutCents,
      upsMinGuaranteeApplied: result.upsMinGuaranteeApplied,
      npsDefaultBenefitCents: result.npsDefaultBenefitCents,
      calcTrace: {
        marker: "PENSION_CALC_TRACE",
        formula: result.formula,
        asOf,
        lastPayDrawnTraceHash: lastPay.traceHash,
      },
      ruleVersionRef: limits.id,
      status: "COMPUTED",
    };
    this.benefitRepository.insertPensionCalculation(calculationRow);
    pensionCase.status = "PENDING_SANCTION";
    pensionCase.calculation = {
      calculationId: calculationRow.id,
      scheme: pensionCase.scheme,
      benefitOutcome: result.benefitOutcome,
      pensionCents: result.basicPensionCents,
      trace: {
        marker: "PENSION_CALC_TRACE",
        ruleVersion: input.ruleVersion,
        ruleVersionRef: limits.id,
        lastPayDrawnTraceHash: lastPay.traceHash,
        formula: result.formula,
        inputs: {
          lastBasicPayCents: lastPay.basicPayCents,
          qualifyingServiceMonths: verification.qualifyingServiceMonths,
        },
      },
    };
    this.audit.recordMutation(actor, {
      action: "G11_PENSION_COMPUTED",
      subjectRef: `pen_pension_calculations:${calculationRow.id}`,
      metadata: {
        marker: "PENSION_CALC_TRACE",
        lastPayMarker: lastPay.marker,
        ruleVersion: input.ruleVersion,
        ruleVersionRef: limits.id,
        scheme: pensionCase.scheme,
        benefitOutcome: result.benefitOutcome,
      },
    });
    return this.cloneCase(pensionCase);
  }

  /** FR-G11-15 self-service "check pension/retirement projections": a non-binding what-if
   *  estimate. Reuses the exact same scheme-branch calculator (`computeSchemeBenefit`) as the
   *  live case computation, but reads real employee/payroll data on the fly and never touches
   *  `this.cases` or persists any row — AC1's "never write to the live case". Callers may vary
   *  `qualifyingServiceMonths`/`emolumentsBaseCents`/`asOf` for a what-if (AC2); when omitted,
   *  qualifying service defaults to (date of joining -> asOf) and emoluments default to the
   *  employee's real G10 last-drawn pay. */
  estimateBenefits(
    actor: ActorContext,
    input: {
      employeeId: string;
      scheme: PensionScheme;
      asOf: string;
      qualifyingServiceMonths?: number;
      emolumentsBaseCents?: number;
      upsOptedIn?: boolean;
      npsEvent?: NpsBenefitEvent;
    }
  ): PensionEstimateResult {
    // Deliberately a distinct, narrower permission from "g11.pension.read" (which gates every
    // admin GET route in this module with no per-row ownership check) — granting the broad
    // permission to a plain self-service employee would expose every one of those routes, the
    // same class of gap this session's own G05/G13 full-reviews caught. This permission only
    // ever gates the two self-scoped methods below, both of which enforce ownership themselves.
    this.authorization.check(actor, "g11.pension.self.read", actor);
    this.assertSelfOrOverride(actor, input.employeeId);
    const employee = this.employeeMaster.getById(actor, input.employeeId);
    if (!employee) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    if (!dateOnly(input.asOf)) {
      throw new FoundationError("VALIDATION_FAILED", "asOf must use YYYY-MM-DD", { field: "asOf" });
    }
    if (input.qualifyingServiceMonths === undefined && !employee.dateOfJoining) {
      throw new FoundationError("VALIDATION_FAILED", "qualifyingServiceMonths is required when the employee has no dateOfJoining on file", {
        field: "qualifyingServiceMonths",
      });
    }
    // A what-if is still a real input to a statutory formula (AC2) — bound it to plausible
    // values rather than silently clamping a nonsensical one (e.g. a negative salary) into the
    // E35 minimum-pension floor and reporting it back as an ordinary result.
    if (
      input.qualifyingServiceMonths !== undefined &&
      (!Number.isInteger(input.qualifyingServiceMonths) || input.qualifyingServiceMonths < 0 || input.qualifyingServiceMonths > 600)
    ) {
      throw new FoundationError("VALIDATION_FAILED", "qualifyingServiceMonths must be an integer between 0 and 600 (50 years)", {
        field: "qualifyingServiceMonths",
      });
    }
    if (input.emolumentsBaseCents !== undefined && (!Number.isInteger(input.emolumentsBaseCents) || input.emolumentsBaseCents <= 0)) {
      throw new FoundationError("VALIDATION_FAILED", "emolumentsBaseCents must be a positive integer", { field: "emolumentsBaseCents" });
    }
    const qualifyingServiceMonths = input.qualifyingServiceMonths ?? Math.max(0, monthsBetween(employee.dateOfJoining as string, input.asOf));
    const emolumentsBaseCents = input.emolumentsBaseCents ?? this.payroll.getLastPayDrawn(actor, input.employeeId).basicPayCents;
    const limits = this.pensionRules.resolvePensionLimits(actor, input.asOf);
    const rounding = this.pensionRules.resolveRoundingRule(actor, input.asOf);
    const result = computeSchemeBenefit({
      scheme: input.scheme,
      qualifyingServiceMonths,
      emolumentsBaseCents,
      avgEmoluments12mCents: emolumentsBaseCents,
      limits,
      rounding,
      upsOptedIn: input.upsOptedIn,
      npsEvent: input.npsEvent,
    });
    this.audit.recordMutation(actor, {
      action: "G11_PENSION_ESTIMATED",
      subjectRef: `employees:${input.employeeId}`,
      metadata: { marker: "NON_BINDING_ESTIMATE", scheme: input.scheme, asOf: input.asOf, benefitOutcome: result.benefitOutcome },
    });
    return {
      isBinding: false,
      employeeId: input.employeeId,
      scheme: input.scheme,
      asOf: input.asOf,
      qualifyingServiceMonths,
      emolumentsBaseCents,
      benefitOutcome: result.benefitOutcome,
      pensionCents: result.basicPensionCents,
      formula: result.formula,
      ruleVersionRef: limits.id,
    };
  }

  /** Self-service "track status" discovery surface: every pension case raised for the given
   *  employee. Self-or-override only — the BRD's Employee-row scoping mirrors every other
   *  module's "(own)" restriction. */
  listMyCases(actor: ActorContext, employeeId: string): PensionCase[] {
    this.authorization.check(actor, "g11.pension.self.read", actor);
    requireTenantScope(actor);
    this.assertSelfOrOverride(actor, employeeId);
    return this.cases.filter((pensionCase) => this.inScope(pensionCase, actor) && pensionCase.employeeId === employeeId).map((pensionCase) => this.cloneCase(pensionCase));
  }

  private isPensionAccessOverride(actor: ActorContext): boolean {
    return Boolean(actor.permissions?.includes("*") || actor.roles?.some((role) => PENSION_ACCESS_OVERRIDE_ROLES.has(role)));
  }

  private assertSelfOrOverride(actor: ActorContext, employeeId: string): void {
    if (this.isPensionAccessOverride(actor) || actor.userId === employeeId) {
      return;
    }
    throw new FoundationError("FORBIDDEN", "You may only access your own pension case or estimate", { field: "employeeId" });
  }

  /** Scoped case read for sibling G11 services (commutation / gratuity / FP / Rule 9). */
  getCase(scope: TenantScope, caseId: string): PensionCase {
    return this.cloneCase(this.requireCase(scope, caseId));
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
    // PH-15B FR-12: PPO authorisation is the ONLY event that creates the pen_pensioners
    // master row — the lifecycle service subscribes here (never hand-keyed off a PPO).
    const issued = this.cloneCase(pensionCase);
    for (const listener of this.ppoIssuedListeners) {
      listener(actor, issued);
    }
    return this.cloneCase(pensionCase);
  }

  /** Subscribe to PPO authorisation (PH-15B: pensioner enrolment on PPO issue). */
  onPpoIssued(listener: PpoIssuedListener): void {
    this.ppoIssuedListeners.push(listener);
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
