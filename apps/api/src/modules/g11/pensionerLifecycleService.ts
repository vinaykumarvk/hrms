import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";
import { PensionBenefitService } from "./pensionBenefitService";
import { PenFamilyPensionRecord, addYearsIso } from "./pensionBenefitRepository";
import {
  G11DeathSource,
  G11LcMethod,
  PenFamilyMember,
  PenLifeCertificate,
  PenPensioner,
  PensionerLifecycleRepository,
  addGraceDaysIso,
  monthIndexOf,
} from "./pensionerLifecycleRepository";
import { PensionCase, PensionService } from "./pensionService";

/**
 * PH-15B — BRD G11 FR-12 pensioner master & lifecycle on the PH-09 pension substrate:
 *   - a pen_pensioners row is created ON PPO AUTHORISATION (the PensionService PPO-issued
 *     hook), never hand-keyed detached from a PPO;
 *   - annual pen_life_certificates: overdue beyond the configurable grace (BR1) suspends
 *     the lifecycle to SUSPENDED_NO_LC and HOLDS disbursement (AC1) — a disbursement to a
 *     suspended pensioner fails closed with ERR-G11-LC-SUSPENDED (409);
 *   - submitting/verifying an LC reactivates the pensioner and releases the held pension
 *     WITH ARREAR for the suspended months (AC2);
 *   - death of a SELF pensioner spawns family-pension conversion through the E26
 *     pen_family_members statutory hierarchy (BR3) using the PH-09C FR-08 rate engine with
 *     enhanced_basis=AFTER_RETIREMENT, issues a FAMILY_PENSION PPO, and moves the pensioner
 *     DECEASED -> CONVERTED_TO_FAMILY in one transaction (AC4).
 * All money is integer paise.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** BR1: LC grace period is configurable; this is only the default window. */
const DEFAULT_LC_GRACE_DAYS = 30;
/** AC1: a submitted/enrolled LC covers one year. */
const LC_VALIDITY_YEARS = 1;

const LC_METHODS: ReadonlySet<string> = new Set<G11LcMethod>(["JEEVAN_PRAMAAN_DLC", "PHYSICAL", "VIDEO_KYC", "BANK_CERTIFIED"]);
const DEATH_SOURCES: ReadonlySet<string> = new Set<G11DeathSource>(["REPORTED", "DEATH_REGISTRY", "DBT_ANOMALY", "LC_FAILURE"]);

export interface LifeCertificateSubmission {
  pensioner: PenPensioner;
  lifeCertificate: PenLifeCertificate;
  /** AC2: true when the submission lifted a SUSPENDED_NO_LC hold. */
  releasedFromSuspension: boolean;
  /** Months of pension held while suspended (released with the arrear). */
  heldMonths: number;
  /** AC2: held pension released on reactivation = monthly (basic + relief) x held months. */
  releasedArrearPaise: number;
}

export interface DeathConversionResult {
  /** The deceased SELF pensioner, now CONVERTED_TO_FAMILY. */
  pensioner: PenPensioner;
  /** The spawned FAMILY pensioner carrying the FAMILY_PENSION PPO. */
  familyPensioner: PenPensioner;
  /** The E26 beneficiary the hierarchy resolved (lowest ACTIVE statutory_rank). */
  familyMember: PenFamilyMember;
  /** The E10 pen_family_pension_records row computed by the PH-09C FR-08 engine. */
  familyPension: PenFamilyPensionRecord;
}

export class PensionerLifecycleService {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly pension: PensionService,
    private readonly pensionBenefits: PensionBenefitService,
    private readonly repository: PensionerLifecycleRepository
  ) {}

  /**
   * FR-12 — pensioner enrolment ON PPO AUTHORISATION. Registered as the PensionService
   * PPO-issued hook; it refuses any case that has not reached PPO_ISSUED with an actual
   * PPO + calculation, so a pen_pensioners row can never exist detached from a PPO.
   */
  enrolFromPpo(actor: ActorContext, pensionCase: PensionCase): PenPensioner {
    this.authorization.check(actor, "g11.ppo.issue", actor);
    if (pensionCase.status !== "PPO_ISSUED" || !pensionCase.ppo || !pensionCase.calculation) {
      throw new FoundationError("PRECONDITION_FAILED", "Pensioner enrolment requires an authorised PPO on the case (FR-12)", {
        details: { caseId: pensionCase.id, status: pensionCase.status },
      });
    }
    if (this.repository.findPensionerByCase(actor, pensionCase.id)) {
      throw new FoundationError("CONFLICT", "A pensioner master row already exists for this case", { details: { caseId: pensionCase.id } });
    }
    const pensioner: PenPensioner = {
      id: nextId("pen-pensioner", this.repository.countPensioners()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      pensionerNo: `PNR/${pensionCase.separationDate.slice(0, 4)}/${String(this.repository.countPensioners() + 1).padStart(5, "0")}`,
      caseId: pensionCase.id,
      employeeId: pensionCase.employeeId,
      ppoId: pensionCase.ppo.id,
      ppoNo: pensionCase.ppo.ppoNo,
      ppoType: "SERVICE_PENSION",
      pensionerType: "SELF",
      currentPensionBasicPaise: pensionCase.calculation.pensionCents,
      currentDaReliefPaise: 0,
      disbursementModel: "M11_COMPUTES_FULL",
      // AC1: the first LC falls due one year after commencement (the separation date).
      lifeCertValidUntil: addYearsIso(pensionCase.separationDate, LC_VALIDITY_YEARS),
      lifecycleStatus: "ACTIVE",
    };
    this.repository.insertPensioner(pensioner);
    this.audit.recordMutation(actor, {
      action: "G11_PENSIONER_ENROLLED",
      subjectRef: `pen_pensioners:${pensioner.id}`,
      metadata: { caseId: pensionCase.id, ppoId: pensioner.ppoId, ppoNo: pensioner.ppoNo, lifeCertValidUntil: pensioner.lifeCertValidUntil },
    });
    return { ...pensioner };
  }

  /** Pensioner 360 read (FR-12 GET surface). */
  getPensioner(scope: TenantScope, pensionerId: string): PenPensioner {
    return { ...this.requirePensioner(scope, pensionerId) };
  }

  /** SELF pensioner for a pension case (used by the FR-14 disbursement LC gate). */
  findPensionerByCase(scope: TenantScope, caseId: string): PenPensioner | undefined {
    requireTenantScope(scope);
    const pensioner = this.repository.findPensionerByCase(scope, caseId);
    return pensioner ? { ...pensioner } : undefined;
  }

  /**
   * FR-14 BR3 / FR-12 AC1 — the disbursement LC gate, FAIL CLOSED: monthly pension to a
   * pensioner whose lifecycle is SUSPENDED_NO_LC is blocked with ERR-G11-LC-SUSPENDED (409)
   * until an LC submission releases the hold (which then pays the held arrear).
   */
  assertDisbursable(scope: TenantScope, caseId: string): void {
    requireTenantScope(scope);
    const pensioner = this.repository.findPensionerByCase(scope, caseId);
    if (pensioner && pensioner.lifecycleStatus === "SUSPENDED_NO_LC") {
      throw new FoundationError("ERR-G11-LC-SUSPENDED", "Pension disbursement is held — the pensioner is SUSPENDED_NO_LC pending a life certificate", {
        details: { pensionerId: pensioner.id, lifeCertValidUntil: pensioner.lifeCertValidUntil, suspendedFrom: pensioner.suspendedFrom },
      });
    }
  }

  /** E26 register write — the statutory family hierarchy conversion draws from (BR3/IR8). */
  registerFamilyMember(
    actor: ActorContext,
    input: { employeeId: string; memberName: string; relation: string; statutoryRank: number; dateOfBirth?: string }
  ): PenFamilyMember {
    this.authorization.check(actor, "g11.pensioner.maintain", actor);
    if (!Number.isInteger(input.statutoryRank) || input.statutoryRank <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "statutoryRank must be a positive integer", { field: "statutoryRank" });
    }
    const member: PenFamilyMember = {
      id: nextId("pen-family-member", this.repository.countFamilyMembers()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      memberName: input.memberName,
      relation: input.relation,
      dateOfBirth: input.dateOfBirth,
      statutoryRank: input.statutoryRank,
      status: "ACTIVE",
    };
    this.repository.insertFamilyMember(member);
    this.audit.recordMutation(actor, {
      action: "G11_FAMILY_MEMBER_REGISTERED",
      subjectRef: `pen_family_members:${member.id}`,
      metadata: { employeeId: input.employeeId, statutoryRank: input.statutoryRank },
    });
    return { ...member };
  }

  /**
   * FR-12 AC1 (JOB-G11-LC-REMIND lapse sweep) — every pensioner whose LC due date plus the
   * configurable grace (BR1) has passed as-of the evaluation date moves to SUSPENDED_NO_LC
   * and disbursement is held from the LC due date.
   */
  evaluateLifeCertificates(actor: ActorContext, input: { asOf: string; graceDays?: number }): PenPensioner[] {
    this.authorization.check(actor, "g11.pensioner.maintain", actor);
    this.assertIsoDate(input.asOf, "asOf");
    const graceDays = input.graceDays ?? DEFAULT_LC_GRACE_DAYS;
    if (!Number.isInteger(graceDays) || graceDays < 0) {
      throw new FoundationError("VALIDATION_FAILED", "graceDays must be a non-negative integer", { field: "graceDays" });
    }
    const suspended: PenPensioner[] = [];
    for (const pensioner of this.repository.listPensioners(actor)) {
      const active = pensioner.lifecycleStatus === "ACTIVE" || pensioner.lifecycleStatus === "FAMILY_PENSION_ACTIVE";
      if (!active || !pensioner.lifeCertValidUntil) {
        continue;
      }
      if (addGraceDaysIso(pensioner.lifeCertValidUntil, graceDays) < input.asOf) {
        pensioner.lifecycleStatus = "SUSPENDED_NO_LC";
        pensioner.suspendedFrom = pensioner.lifeCertValidUntil;
        this.repository.savePensioner(pensioner);
        this.audit.recordMutation(actor, {
          action: "G11_PENSIONER_LC_SUSPENDED",
          subjectRef: `pen_pensioners:${pensioner.id}`,
          metadata: { marker: "JOB-G11-LC-REMIND", lifeCertValidUntil: pensioner.lifeCertValidUntil, graceDays, asOf: input.asOf },
        });
        suspended.push({ ...pensioner });
      }
    }
    return suspended;
  }

  /**
   * FR-12 AC2 — LC submission/verification. Stores the pen_life_certificates row (prior
   * ACTIVE row superseded), refreshes the due date, and — when the pensioner was
   * SUSPENDED_NO_LC — reactivates the lifecycle and releases the held pension WITH ARREAR:
   * monthly (basic + relief) x months held since suspension. Persisted atomically.
   */
  submitLifeCertificate(
    actor: ActorContext,
    pensionerId: string,
    input: { certificateYear: number; method: G11LcMethod; submittedOn: string; jeevanPramaanId?: string }
  ): LifeCertificateSubmission {
    this.authorization.check(actor, "g11.pensioner.maintain", actor);
    this.assertIsoDate(input.submittedOn, "submittedOn");
    if (!LC_METHODS.has(input.method)) {
      throw new FoundationError("VALIDATION_FAILED", "method must be JEEVAN_PRAMAAN_DLC, PHYSICAL, VIDEO_KYC, or BANK_CERTIFIED", { field: "method" });
    }
    if (!Number.isInteger(input.certificateYear) || input.certificateYear < 1900) {
      throw new FoundationError("VALIDATION_FAILED", "certificateYear must be a calendar year", { field: "certificateYear" });
    }
    const pensioner = this.requirePensioner(actor, pensionerId);
    if (pensioner.lifecycleStatus === "DECEASED" || pensioner.lifecycleStatus === "CONVERTED_TO_FAMILY" || pensioner.lifecycleStatus === "CEASED") {
      throw new FoundationError("CONFLICT", "Life certificates cannot be recorded for a terminated pensioner lifecycle", {
        details: { pensionerId, lifecycleStatus: pensioner.lifecycleStatus },
      });
    }
    const certificate: PenLifeCertificate = {
      id: nextId("pen-life-certificate", this.repository.countLifeCertificates()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      pensionerId,
      certificateYear: input.certificateYear,
      method: input.method,
      jeevanPramaanId: input.jeevanPramaanId,
      submittedOn: input.submittedOn,
      validUntil: addYearsIso(input.submittedOn, LC_VALIDITY_YEARS),
      result: "VALID",
      status: "ACTIVE",
    };
    const wasSuspended = pensioner.lifecycleStatus === "SUSPENDED_NO_LC";
    let heldMonths = 0;
    let releasedArrearPaise = 0;
    if (wasSuspended) {
      // AC2: the hold spans whole pension months from the suspension point (the lapsed LC
      // due date) to the submission month — released in full as arrear, integer paise.
      const suspendedFrom = pensioner.suspendedFrom ?? pensioner.lifeCertValidUntil ?? input.submittedOn;
      heldMonths = Math.max(1, monthIndexOf(input.submittedOn) - monthIndexOf(suspendedFrom));
      releasedArrearPaise = (pensioner.currentPensionBasicPaise + pensioner.currentDaReliefPaise) * heldMonths;
      pensioner.lifecycleStatus = pensioner.pensionerType === "FAMILY" ? "FAMILY_PENSION_ACTIVE" : "ACTIVE";
      pensioner.suspendedFrom = undefined;
    }
    pensioner.lifeCertValidUntil = certificate.validUntil;
    this.repository.recordLifeCertificate(certificate, pensioner);
    this.audit.recordMutation(actor, {
      action: "G11_LIFE_CERTIFICATE_SUBMITTED",
      subjectRef: `pen_life_certificates:${certificate.id}`,
      metadata: {
        pensionerId,
        method: input.method,
        validUntil: certificate.validUntil,
        releasedFromSuspension: wasSuspended,
        heldMonths,
        releasedArrearPaise,
      },
    });
    return { pensioner: { ...pensioner }, lifeCertificate: { ...certificate }, releasedFromSuspension: wasSuspended, heldMonths, releasedArrearPaise };
  }

  /** Prior + current LC rows for the pensioner (LC calendar surface). */
  listLifeCertificates(scope: TenantScope, pensionerId: string): PenLifeCertificate[] {
    this.requirePensioner(scope, pensionerId);
    return this.repository.listLifeCertificates(scope, pensionerId).map((row) => ({ ...row }));
  }

  /**
   * FR-12 AC4 — death of a SELF pensioner. Resolves the beneficiary from the E26
   * pen_family_members statutory hierarchy (BR3: lowest ACTIVE statutory_rank — never the
   * nominee register), computes the family pension through the PH-09C FR-08 engine with
   * enhanced_basis=AFTER_RETIREMENT (pen_family_pension_records + pen_family_pension_rates),
   * issues a FAMILY_PENSION PPO, and moves the pensioner DECEASED -> CONVERTED_TO_FAMILY —
   * all persisted in ONE transaction.
   */
  reportDeath(actor: ActorContext, pensionerId: string, input: { dateOfDeath: string; source?: G11DeathSource }): DeathConversionResult {
    this.authorization.check(actor, "g11.pensioner.maintain", actor);
    this.assertIsoDate(input.dateOfDeath, "dateOfDeath");
    const source = input.source ?? "REPORTED";
    if (!DEATH_SOURCES.has(source)) {
      throw new FoundationError("VALIDATION_FAILED", "source must be REPORTED, DEATH_REGISTRY, DBT_ANOMALY, or LC_FAILURE", { field: "source" });
    }
    const pensioner = this.requirePensioner(actor, pensionerId);
    if (pensioner.lifecycleStatus === "DECEASED" || pensioner.lifecycleStatus === "CONVERTED_TO_FAMILY" || pensioner.lifecycleStatus === "CEASED") {
      throw new FoundationError("CONFLICT", "The pensioner lifecycle is already terminated", { details: { pensionerId, lifecycleStatus: pensioner.lifecycleStatus } });
    }
    if (pensioner.pensionerType !== "SELF") {
      // Edge case: a family pensioner's own death passes to the next E26 member — that chain
      // is a separate conversion; this path only ceases the FAMILY row.
      pensioner.dateOfDeath = input.dateOfDeath;
      pensioner.deathDetectedSource = source;
      pensioner.lifecycleStatus = "CEASED";
      this.repository.savePensioner(pensioner);
      this.audit.recordMutation(actor, { action: "G11_FAMILY_PENSIONER_CEASED", subjectRef: `pen_pensioners:${pensioner.id}`, metadata: { source } });
      throw new FoundationError("PRECONDITION_FAILED", "Family-pension conversion applies to SELF pensioners; the FAMILY row was CEASED", {
        details: { pensionerId },
      });
    }
    // BR3/IR8: the beneficiary comes from the E26 statutory hierarchy by rank.
    const eligible = this.repository
      .listFamilyMembers(actor, pensioner.employeeId)
      .filter((member) => member.status === "ACTIVE")
      .sort((left, right) => left.statutoryRank - right.statutoryRank);
    const familyMember = eligible[0];
    if (!familyMember) {
      // Failure handling: conversion with no eligible E26 member raises the legal-heir flag.
      throw new FoundationError("PRECONDITION_FAILED", "No ACTIVE pen_family_members row — family-pension conversion needs the E26 hierarchy (legal-heir flag)", {
        details: { pensionerId, employeeId: pensioner.employeeId, legalHeirFlag: true },
      });
    }
    // FR-08 via the PH-09C engine: AFTER_RETIREMENT enhanced window, rates from
    // pen_family_pension_rates — never inline constants.
    const familyPension = this.pensionBenefits.computeFamilyPension(actor, pensioner.caseId, {
      enhancedBasis: "AFTER_RETIREMENT",
      eventDate: input.dateOfDeath,
      dateOfBirth: familyMember.dateOfBirth,
    });
    const familyPpoNo = `PPO/F/${input.dateOfDeath.slice(0, 4)}/${String(this.repository.countPensioners() + 1).padStart(5, "0")}`;
    const familyPensioner: PenPensioner = {
      id: nextId("pen-pensioner", this.repository.countPensioners()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      pensionerNo: `PNR/F/${input.dateOfDeath.slice(0, 4)}/${String(this.repository.countPensioners() + 1).padStart(5, "0")}`,
      caseId: pensioner.caseId,
      employeeId: pensioner.employeeId,
      ppoId: nextId("ppo-family", this.repository.countPensioners()),
      ppoNo: familyPpoNo,
      ppoType: "FAMILY_PENSION",
      pensionerType: "FAMILY",
      // The enhanced amount applies from the event date when the window grants it (FR-08).
      currentPensionBasicPaise: familyPension.enhancedAmountCents ?? familyPension.normalAmountCents,
      currentDaReliefPaise: 0,
      disbursementModel: pensioner.disbursementModel,
      lifeCertValidUntil: addYearsIso(input.dateOfDeath, LC_VALIDITY_YEARS),
      sourcePensionerId: pensioner.id,
      familyMemberId: familyMember.id,
      familyPensionRef: familyPension.id,
      lifecycleStatus: "FAMILY_PENSION_ACTIVE",
    };
    pensioner.dateOfDeath = input.dateOfDeath;
    pensioner.deathDetectedSource = source;
    pensioner.lifecycleStatus = "CONVERTED_TO_FAMILY";
    // AC4: deceased terminal state + spawned FAMILY row persist atomically (one transaction).
    this.repository.applyDeathConversion(pensioner, familyPensioner);
    this.audit.recordMutation(actor, {
      action: "G11_DEATH_CONVERTED_TO_FAMILY",
      subjectRef: `pen_pensioners:${pensioner.id}`,
      metadata: {
        marker: "CONVERTED_TO_FAMILY",
        source,
        familyPensionerId: familyPensioner.id,
        familyPpoNo,
        familyMemberId: familyMember.id,
        familyPensionRef: familyPension.id,
      },
    });
    return {
      pensioner: { ...pensioner },
      familyPensioner: { ...familyPensioner },
      familyMember: { ...familyMember },
      familyPension,
    };
  }

  private requirePensioner(scope: TenantScope, pensionerId: string): PenPensioner {
    requireTenantScope(scope);
    const pensioner = this.repository.findPensionerById(scope, pensionerId);
    if (!pensioner) {
      throw new FoundationError("NOT_FOUND", "Pensioner not found");
    }
    return pensioner;
  }

  private assertIsoDate(value: string, field: string): void {
    if (!ISO_DATE.test(value)) {
      throw new FoundationError("VALIDATION_FAILED", `${field} must be an ISO date (YYYY-MM-DD)`, { field });
    }
  }
}
