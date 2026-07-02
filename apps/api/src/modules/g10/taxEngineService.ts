import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { PayRuleRepository, RateTableRow, TaxRegime, windowCovers } from "./payRuleRepository";
import { EnginePayslipLine, PayrollEngineRepository } from "./payrollEngineRepository";
import {
  PreviousEmployerIncome,
  Relief891,
  RemittanceScheme,
  StatutoryRemittance,
  TaxDeclaration,
  TaxEngineRepository,
} from "./taxEngineRepository";

/**
 * PH-15A — G10 income-tax/TDS engine and statutory certificates at BRD depth
 * (FR-G10-07 / FR-G10-17 / FR-G10-19):
 *
 * - E15 tax_declarations with regime handling: switching regime (OLD/NEW) recomputes the
 *   FULL pipeline and per-month TDS (FR-07 AC1), with every intermediate stage persisted
 *   (FR-07 AC5): gross taxable -> standard_deduction -> Chapter VI-A caps (clamped, OLD
 *   regime only per BR1) -> slab tax -> surcharge with marginal_relief (BR4) -> cess
 *   (BRD names the 4% cess; the rate itself is a rate-table row) -> rebate_87a ->
 *   89(1)/Form-10E relief -> projected_annual_tax.
 * - FR-07 BR2 TDS spread: monthly TDS = (projected annual tax − YTD TDS derived from the
 *   immutable payslip_lines ledger, VAL-G10-YTD-DERIVE) / remaining months of the FY.
 * - FR-07 AC3 cutoff lock: declaration mutation after the FY proof cutoff throws the
 *   registered mutation-after-freeze code ERR-G10-SNAPSHOT-FROZEN (409) — the BRD registers
 *   no declaration-specific code, so no new identifier is minted.
 * - E29 statutory_remittances: deducted (Σ payslip_lines, FR-19 AC1) -> DEPOSITED
 *   (challan/CIN) -> MATCHED (ties within tolerance).
 * - Form-16 (FR-17 AC1): TDS totals tie to Σ TDS payslip_lines for the FY, and Part A
 *   derives ONLY from MATCHED statutory_remittances — generation is BLOCKED while any FY
 *   TDS remittance is not MATCHED (AC5: undeposited TDS prevents premature certification).
 * - Form-24Q (FR-17 AC2): quarterly aggregation whose totals reconcile to the monthly TDS
 *   payslip_lines in the quarter; a mismatch against accrued remittances blocks.
 *
 * DETERMINISM/MONEY: all money is integer paise — no float parsing and no string rounding.
 * Slab boundaries, surcharge thresholds, cess rate, 87A limits, standard deduction, and
 * Chapter VI-A caps are effective-dated TAX_SLAB rate-table rows (regime + FY dimensioned,
 * migration 0014) — never constants in this engine. Missing slab rows fail closed with
 * ERR-G10-TAXSLAB-NOTFOUND (422).
 */

/** TDS ledger component code — the payslip_lines rows Form-16/24Q and BR2 derive from. */
const TDS_COMPONENT_CODE = "TDS";

/** TAX_SLAB rate-table key codes (rows carry regime + financial_year; VAL-G10-RATE-NONOVERLAP). */
const KEY_SLAB = "SLAB";
const KEY_STD_DEDUCTION = "STD_DEDUCTION";
const KEY_SURCHARGE = "SURCHARGE";
const KEY_CESS = "CESS";
const KEY_REBATE_87A = "REBATE_87A";
const KEY_CAP_80C = "CAP_80C";
const KEY_CAP_80D = "CAP_80D";

const FY_MONTH_COUNT = 12;

export interface TaxPipelineStage {
  stage: string;
  amountPaise: number;
}

/** FR-07 BR2 projection working — every input is ledger-derived, never a mutable counter. */
export interface MonthlyTdsProjection {
  validation: "VAL-G10-YTD-DERIVE";
  ytdTdsPaise: number;
  previousEmployerTdsPaise: number;
  remainingMonths: number;
  monthlyTdsPaise: number;
}

export interface TaxDeclarationView extends TaxDeclaration {
  /** FR-07 AC5: the persisted stages as a step-by-step breakdown. */
  breakdown: TaxPipelineStage[];
  projection: MonthlyTdsProjection;
}

export interface Form16Quarter {
  quarter: string;
  periods: string[];
  tdsPaise: number;
  remittanceIds: string[];
}

export interface Form16Statement {
  employeeId: string;
  financialYear: string;
  /** FR-17 AC1: ties to Σ TDS payslip_lines for the FY (VAL-G10-YTD-DERIVE). */
  ledgerTdsTotalPaise: number;
  /** Part A — derived ONLY from MATCHED statutory_remittances rows (FR-17 BR4). */
  partA: { source: "statutory_remittances"; requiredStatus: "MATCHED"; quarters: Form16Quarter[]; totalPaise: number };
  /** Part B — the full FR-07 pipeline from the persisted declaration stages. */
  partB: {
    regime: TaxRegime;
    grossTaxablePaise: number;
    standardDeductionPaise: number;
    chapterViaTotalPaise: number;
    taxableIncomePaise: number;
    slabTaxPaise: number;
    surchargePaise: number;
    marginalReliefPaise: number;
    cessPaise: number;
    rebate87aPaise: number;
    relief891Paise: number;
    projectedAnnualTaxPaise: number;
  };
}

export interface Form24QStatement {
  financialYear: string;
  quarter: string;
  months: { period: string; tdsPaise: number; employeeCount: number }[];
  quarterlyTotalPaise: number;
  /** FR-17 AC2: quarterly total reconciles to the monthly TDS payslip_lines in the quarter. */
  reconciled: boolean;
}

export class TaxEngineService {
  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly payRuleRepository: PayRuleRepository,
    private readonly payrollEngineRepository: PayrollEngineRepository,
    private readonly repository: TaxEngineRepository
  ) {}

  /**
   * E15 upsert (FR-07): capture/refresh the declaration and recompute the FULL pipeline —
   * every stage is persisted on tax_declarations (AC5). Mutation after the FY proof cutoff
   * throws ERR-G10-SNAPSHOT-FROZEN (AC3).
   */
  upsertDeclaration(
    actor: ActorContext,
    input: {
      employeeId: string;
      financialYear: string;
      regime: TaxRegime;
      declared80cPaise?: number;
      declared80dPaise?: number;
      hraExemptionPaise?: number;
      homeLoanInterestPaise?: number;
      previousEmployerIncome?: PreviousEmployerIncome;
      relief891?: Relief891;
      perquisiteTotalPaise?: number;
      /** Mutation date for the cutoff-lock check (FR-07 AC3); defaults to today. */
      asOf?: string;
    }
  ): TaxDeclarationView {
    this.authorization.check(actor, "g10.tax.declare", actor);
    if (!this.employeeMaster.getById(actor, input.employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    assertFinancialYear(input.financialYear);
    for (const [field, value] of Object.entries({
      declared80cPaise: input.declared80cPaise,
      declared80dPaise: input.declared80dPaise,
      hraExemptionPaise: input.hraExemptionPaise,
      homeLoanInterestPaise: input.homeLoanInterestPaise,
      perquisiteTotalPaise: input.perquisiteTotalPaise,
    })) {
      if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
        throw new FoundationError("VALIDATION_FAILED", `${field} must be non-negative integer paise`, { field });
      }
    }
    const existing = this.repository.findDeclaration(actor, input.employeeId, input.financialYear);
    this.assertNotFrozen(existing, input.asOf ?? todayIsoDate());
    const declaration: TaxDeclaration = {
      id: existing?.id ?? nextId("tax-declaration", this.repository.countDeclarations()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      financialYear: input.financialYear,
      regime: input.regime,
      declared80cPaise: input.declared80cPaise ?? existing?.declared80cPaise ?? 0,
      declared80dPaise: input.declared80dPaise ?? existing?.declared80dPaise ?? 0,
      hraExemptionPaise: input.hraExemptionPaise ?? existing?.hraExemptionPaise ?? 0,
      homeLoanInterestPaise: input.homeLoanInterestPaise ?? existing?.homeLoanInterestPaise ?? 0,
      previousEmployerIncome: input.previousEmployerIncome ?? existing?.previousEmployerIncome,
      relief891: input.relief891 ?? existing?.relief891,
      perquisiteTotalPaise: input.perquisiteTotalPaise ?? existing?.perquisiteTotalPaise ?? 0,
      grossTaxablePaise: 0,
      standardDeductionPaise: 0,
      chapterViaTotalPaise: 0,
      taxableIncomePaise: 0,
      slabTaxPaise: 0,
      surchargePaise: 0,
      marginalReliefPaise: 0,
      cessPaise: 0,
      rebate87aPaise: 0,
      relief891Paise: 0,
      projectedAnnualTaxPaise: 0,
      monthlyTdsPaise: 0,
      proofCutoffDate: existing?.proofCutoffDate,
      status: existing?.status === "DRAFT" || !existing ? "SUBMITTED" : existing.status,
    };
    const view = this.recomputeAndPersist(actor, declaration);
    this.audit.recordMutation(actor, {
      action: "G10_TAX_DECLARATION_SAVED",
      subjectRef: `g10_tax_declarations:${declaration.id}`,
      metadata: { employeeId: declaration.employeeId, financialYear: declaration.financialYear, regime: declaration.regime },
    });
    return view;
  }

  /**
   * FR-07 AC1: switching regime (OLD <-> NEW) recomputes the FULL pipeline — every persisted
   * stage on tax_declarations is replaced — plus the per-month TDS spread. Post-cutoff
   * switches throw ERR-G10-SNAPSHOT-FROZEN (AC3).
   */
  switchRegime(actor: ActorContext, input: { employeeId: string; financialYear: string; regime: TaxRegime; asOf?: string }): TaxDeclarationView {
    this.authorization.check(actor, "g10.tax.declare", actor);
    const declaration = this.requireDeclaration(actor, input.employeeId, input.financialYear);
    this.assertNotFrozen(declaration, input.asOf ?? todayIsoDate());
    const previousRegime = declaration.regime;
    declaration.regime = input.regime;
    const view = this.recomputeAndPersist(actor, declaration);
    this.audit.recordMutation(actor, {
      action: "G10_TAX_REGIME_SWITCHED",
      subjectRef: `g10_tax_declarations:${declaration.id}`,
      metadata: { employeeId: declaration.employeeId, financialYear: declaration.financialYear, from: previousRegime, to: input.regime },
    });
    return view;
  }

  /**
   * FR-07 AC4: re-run the pipeline when salary/arrears/perquisites change — the projection
   * re-derives from the current payslip_lines ledger. Read-side of the same computation
   * the mutations persist; no cutoff check because nothing declared changes.
   */
  recomputeDeclaration(actor: ActorContext, input: { employeeId: string; financialYear: string }): TaxDeclarationView {
    this.authorization.check(actor, "g10.tax.declare", actor);
    const declaration = this.requireDeclaration(actor, input.employeeId, input.financialYear);
    return this.recomputeAndPersist(actor, declaration);
  }

  /**
   * FR-07 AC3: administer the FY proof cutoff on the declaration. After this date every
   * declaration mutation throws the registered freeze code ERR-G10-SNAPSHOT-FROZEN (409).
   */
  setProofCutoff(actor: ActorContext, input: { employeeId: string; financialYear: string; cutoffDate: string }): TaxDeclarationView {
    this.authorization.check(actor, "g10.tax.cutoff", actor);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.cutoffDate)) {
      throw new FoundationError("VALIDATION_FAILED", "cutoffDate must use YYYY-MM-DD", { field: "cutoffDate" });
    }
    const declaration = this.requireDeclaration(actor, input.employeeId, input.financialYear);
    declaration.proofCutoffDate = input.cutoffDate;
    const view = this.recomputeAndPersist(actor, declaration);
    this.audit.recordMutation(actor, {
      action: "G10_TAX_PROOF_CUTOFF_SET",
      subjectRef: `g10_tax_declarations:${declaration.id}`,
      metadata: { financialYear: declaration.financialYear, cutoffDate: input.cutoffDate },
    });
    return view;
  }

  /** Declaration with the persisted step-by-step stage breakdown (FR-07 AC5). */
  getDeclaration(scope: TenantScope, employeeId: string, financialYear: string): TaxDeclarationView {
    requireTenantScope(scope);
    const declaration = this.requireDeclaration(scope, employeeId, financialYear);
    return this.toView(scope, declaration);
  }

  /**
   * E29 accrual (FR-19 AC1): one statutory_remittances row per scheme/period whose
   * deducted_total is DERIVED from the immutable payslip_lines ledger — never hand-keyed.
   */
  accrueRemittance(
    actor: ActorContext,
    input: { scheme: RemittanceScheme; period: string; statutoryDueDate: string; employerTotalPaise?: number; state?: string }
  ): StatutoryRemittance {
    this.authorization.check(actor, "g10.statutory.write", actor);
    if (!/^\d{4}-\d{2}$/.test(input.period)) {
      throw new FoundationError("VALIDATION_FAILED", "period must use YYYY-MM", { field: "period" });
    }
    const componentCode = componentForScheme(input.scheme);
    const deductedTotalPaise = this.survivingLines(actor, { period: input.period })
      .filter((line) => line.componentCode === componentCode && line.lineType === "DEDUCTION")
      .reduce((total, line) => total + line.amountCents, 0);
    const employerTotalPaise = input.employerTotalPaise ?? 0;
    const remittance: StatutoryRemittance = {
      id: nextId("statutory-remittance", this.repository.countRemittances()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      remittanceNo: `REM-${input.scheme}-${input.period}-${String(this.repository.countRemittances() + 1).padStart(4, "0")}`,
      scheme: input.scheme,
      state: input.state,
      period: input.period,
      financialYear: financialYearOfPeriod(input.period),
      deductedTotalPaise,
      employerTotalPaise,
      remittableTotalPaise: deductedTotalPaise + employerTotalPaise,
      statutoryDueDate: input.statutoryDueDate,
      status: "ACCRUED",
    };
    this.repository.saveRemittance(remittance);
    this.audit.recordMutation(actor, {
      action: "G10_REMITTANCE_ACCRUED",
      subjectRef: `g10_statutory_remittances:${remittance.id}`,
      metadata: { scheme: remittance.scheme, period: remittance.period, deductedTotalPaise, source: "payslip_lines" },
    });
    return { ...remittance };
  }

  /** FR-19 AC2: capture the actual challan/CIN/deposit — ACCRUED -> DEPOSITED. */
  captureDeposit(
    actor: ActorContext,
    remittanceId: string,
    input: { challanNo: string; cin?: string; depositDate: string; depositedAmountPaise: number }
  ): StatutoryRemittance {
    this.authorization.check(actor, "g10.statutory.write", actor);
    const remittance = this.requireRemittance(actor, remittanceId);
    if (remittance.status !== "ACCRUED" && remittance.status !== "SCHEDULED") {
      throw new FoundationError("PRECONDITION_FAILED", `Only an ACCRUED/SCHEDULED remittance can capture a deposit (status ${remittance.status})`);
    }
    if (!Number.isInteger(input.depositedAmountPaise) || input.depositedAmountPaise < 0) {
      throw new FoundationError("VALIDATION_FAILED", "depositedAmountPaise must be non-negative integer paise", { field: "depositedAmountPaise" });
    }
    remittance.challanNo = input.challanNo;
    remittance.cin = input.cin;
    remittance.depositDate = input.depositDate;
    remittance.depositedAmountPaise = input.depositedAmountPaise;
    remittance.status = "DEPOSITED";
    this.repository.saveRemittance(remittance);
    this.audit.recordMutation(actor, {
      action: "G10_REMITTANCE_DEPOSITED",
      subjectRef: `g10_statutory_remittances:${remittance.id}`,
      metadata: { challanNo: input.challanNo, depositedAmountPaise: input.depositedAmountPaise },
    });
    return { ...remittance };
  }

  /**
   * FR-19 AC2: DEPOSITED -> MATCHED only when the deposit ties to the ledger-derived
   * remittable total within tolerance; outside tolerance the row flips to SHORT_PAID.
   */
  matchRemittance(actor: ActorContext, remittanceId: string, input: { tolerancePaise?: number } = {}): StatutoryRemittance {
    this.authorization.check(actor, "g10.statutory.certify", actor);
    const remittance = this.requireRemittance(actor, remittanceId);
    if (remittance.status !== "DEPOSITED") {
      throw new FoundationError("PRECONDITION_FAILED", `Only a DEPOSITED remittance can be matched (status ${remittance.status})`);
    }
    const tolerancePaise = input.tolerancePaise ?? 0;
    const variance = (remittance.depositedAmountPaise ?? 0) - remittance.remittableTotalPaise;
    remittance.toleranceVariancePaise = variance;
    remittance.status = Math.abs(variance) <= tolerancePaise ? "MATCHED" : "SHORT_PAID";
    if (remittance.status === "MATCHED") {
      remittance.matchedBy = actor.userId;
    }
    this.repository.saveRemittance(remittance);
    this.audit.recordMutation(actor, {
      action: "G10_REMITTANCE_MATCH_ATTEMPTED",
      subjectRef: `g10_statutory_remittances:${remittance.id}`,
      metadata: { status: remittance.status, variancePaise: variance, tolerancePaise },
    });
    return { ...remittance };
  }

  listRemittances(scope: TenantScope, filter?: { scheme?: RemittanceScheme; financialYear?: string; period?: string }): StatutoryRemittance[] {
    requireTenantScope(scope);
    return this.repository.listRemittances(scope, filter).map((row) => ({ ...row }));
  }

  /**
   * FR-17 Form-16: TDS totals tie to Σ TDS payslip_lines for the FY (AC1), and Part A
   * derives ONLY from MATCHED statutory_remittances rows — generation is BLOCKED while any
   * FY TDS remittance is not MATCHED (AC5/BR4: undeposited TDS prevents certification).
   */
  generateForm16(actor: ActorContext, input: { employeeId: string; financialYear: string }): Form16Statement {
    this.authorization.check(actor, "g10.statutory.certify", actor);
    assertFinancialYear(input.financialYear);
    const declaration = this.requireDeclaration(actor, input.employeeId, input.financialYear);
    const fyRemittances = this.repository.listRemittances(actor, { scheme: "TDS", financialYear: input.financialYear });
    if (fyRemittances.length === 0) {
      throw new FoundationError("PRECONDITION_FAILED", "Form-16 Part A requires MATCHED TDS statutory_remittances for the FY — none accrued", {
        details: { financialYear: input.financialYear, requiredStatus: "MATCHED" },
      });
    }
    const unmatched = fyRemittances.filter((row) => row.status !== "MATCHED");
    if (unmatched.length > 0) {
      // FR-17 AC5: TDS deducted but not yet MATCHED blocks Part A — fail closed, never stub.
      throw new FoundationError("PRECONDITION_FAILED", "Form-16 Part A is blocked: TDS remittances for the FY are not all MATCHED", {
        details: {
          financialYear: input.financialYear,
          requiredStatus: "MATCHED",
          pending: unmatched.map((row) => ({ remittanceId: row.id, period: row.period, status: row.status })),
        },
      });
    }
    // AC1 tie-out: the certificate figure IS the ledger sum (VAL-G10-YTD-DERIVE), and the
    // MATCHED Part A rows must reconcile to it — a drifted accrual fails closed.
    const ledgerTdsTotalPaise = this.fyTdsLines(actor, input.employeeId, input.financialYear).reduce((total, line) => total + line.amountCents, 0);
    const partATotalPaise = fyRemittances.reduce((total, row) => total + row.deductedTotalPaise, 0);
    const partAExpectedPaise = this.fyTdsLinesAllEmployees(actor, input.financialYear).reduce((total, line) => total + line.amountCents, 0);
    if (partATotalPaise !== partAExpectedPaise) {
      throw new FoundationError("ERR-G10-RECON-TIEOUT", "Form-16 Part A MATCHED remittances do not tie to the FY TDS payslip_lines ledger", {
        details: { partATotalPaise, ledgerPaise: partAExpectedPaise, financialYear: input.financialYear },
      });
    }
    const quarters = fyQuarters(input.financialYear).map((quarter) => {
      const rows = fyRemittances.filter((row) => quarter.periods.includes(row.period));
      return {
        quarter: quarter.quarter,
        periods: quarter.periods,
        tdsPaise: rows.reduce((total, row) => total + row.deductedTotalPaise, 0),
        remittanceIds: rows.map((row) => row.id),
      };
    });
    const statement: Form16Statement = {
      employeeId: input.employeeId,
      financialYear: input.financialYear,
      ledgerTdsTotalPaise,
      partA: { source: "statutory_remittances", requiredStatus: "MATCHED", quarters, totalPaise: partATotalPaise },
      partB: {
        regime: declaration.regime,
        grossTaxablePaise: declaration.grossTaxablePaise,
        standardDeductionPaise: declaration.standardDeductionPaise,
        chapterViaTotalPaise: declaration.chapterViaTotalPaise,
        taxableIncomePaise: declaration.taxableIncomePaise,
        slabTaxPaise: declaration.slabTaxPaise,
        surchargePaise: declaration.surchargePaise,
        marginalReliefPaise: declaration.marginalReliefPaise,
        cessPaise: declaration.cessPaise,
        rebate87aPaise: declaration.rebate87aPaise,
        relief891Paise: declaration.relief891Paise,
        projectedAnnualTaxPaise: declaration.projectedAnnualTaxPaise,
      },
    };
    this.audit.recordMutation(actor, {
      action: "G10_FORM16_GENERATED",
      subjectRef: `g10_tax_declarations:${declaration.id}`,
      metadata: { financialYear: input.financialYear, ledgerTdsTotalPaise, partATotalPaise, partASource: "MATCHED statutory_remittances" },
    });
    return statement;
  }

  /**
   * FR-17 AC2 Form-24Q: quarterly aggregation over the TDS payslip_lines ledger. The
   * quarterly total must reconcile to the monthly TDS lines in the quarter, and any accrued
   * TDS remittance for a month must tie to that month's ledger sum — a mismatch blocks.
   */
  generateForm24Q(actor: ActorContext, input: { financialYear: string; quarter: "Q1" | "Q2" | "Q3" | "Q4" }): Form24QStatement {
    this.authorization.check(actor, "g10.statutory.certify", actor);
    assertFinancialYear(input.financialYear);
    const quarter = fyQuarters(input.financialYear).find((entry) => entry.quarter === input.quarter);
    if (!quarter) {
      throw new FoundationError("VALIDATION_FAILED", "quarter must be Q1..Q4", { field: "quarter" });
    }
    const months = quarter.periods.map((period) => {
      const lines = this.survivingLines(actor, { period }).filter(
        (line) => line.componentCode === TDS_COMPONENT_CODE && line.lineType === "DEDUCTION"
      );
      return {
        period,
        tdsPaise: lines.reduce((total, line) => total + line.amountCents, 0),
        employeeCount: new Set(lines.map((line) => line.employeeId)).size,
      };
    });
    const quarterlyTotalPaise = months.reduce((total, month) => total + month.tdsPaise, 0);
    for (const month of months) {
      const accrued = this.repository.listRemittances(actor, { scheme: "TDS", period: month.period });
      for (const row of accrued) {
        if (row.deductedTotalPaise !== month.tdsPaise) {
          // FR-17 AC2 fail-closed: a stale accrual that no longer ties to the ledger blocks 24Q.
          throw new FoundationError("ERR-G10-RECON-TIEOUT", "Form-24Q monthly TDS does not reconcile to the accrued statutory_remittances row", {
            details: { period: month.period, ledgerPaise: month.tdsPaise, remittancePaise: row.deductedTotalPaise, remittanceId: row.id },
          });
        }
      }
    }
    this.audit.recordMutation(actor, {
      action: "G10_FORM24Q_GENERATED",
      subjectRef: `g10_statutory_remittances:${input.financialYear}-${input.quarter}`,
      metadata: { financialYear: input.financialYear, quarter: input.quarter, quarterlyTotalPaise },
    });
    return { financialYear: input.financialYear, quarter: input.quarter, months, quarterlyTotalPaise, reconciled: true };
  }

  // -- internals --------------------------------------------------------------------------

  /** FR-07 AC3: mutation after the FY proof cutoff throws the registered freeze code (409). */
  private assertNotFrozen(declaration: TaxDeclaration | undefined, asOf: string): void {
    if (declaration?.proofCutoffDate && asOf > declaration.proofCutoffDate) {
      declaration.status = "LOCKED";
      this.repository.saveDeclaration(declaration);
      throw new FoundationError("ERR-G10-SNAPSHOT-FROZEN", "Tax declaration is frozen: the FY proof cutoff has passed (FR-07 AC3)", {
        details: { declarationId: declaration.id, financialYear: declaration.financialYear, proofCutoffDate: declaration.proofCutoffDate, asOf },
      });
    }
  }

  /** Run the FULL pipeline (FR-07 AC5) and persist every stage on the declaration row. */
  private recomputeAndPersist(scope: TenantScope, declaration: TaxDeclaration): TaxDeclarationView {
    const computed = this.computePipeline(scope, declaration);
    Object.assign(declaration, computed.stages);
    this.repository.saveDeclaration(declaration);
    return this.buildView(declaration, computed.breakdown, computed.projection);
  }

  private toView(scope: TenantScope, declaration: TaxDeclaration): TaxDeclarationView {
    const computed = this.computePipeline(scope, declaration);
    return this.buildView(declaration, computed.breakdown, computed.projection);
  }

  private buildView(declaration: TaxDeclaration, breakdown: TaxPipelineStage[], projection: MonthlyTdsProjection): TaxDeclarationView {
    return {
      ...declaration,
      previousEmployerIncome: declaration.previousEmployerIncome ? { ...declaration.previousEmployerIncome } : undefined,
      relief891: declaration.relief891 ? { ...declaration.relief891 } : undefined,
      breakdown: breakdown.map((stage) => ({ ...stage })),
      projection: { ...projection },
    };
  }

  /**
   * The statutory computation pipeline (FR-07): gross taxable -> standard_deduction ->
   * Chapter VI-A caps -> slab tax -> surcharge with marginal relief -> cess -> rebate_87a ->
   * 89(1) relief -> projected annual tax -> monthly TDS (BR2). Integer paise throughout;
   * every threshold/rate/cap resolves from effective-dated TAX_SLAB rate rows.
   */
  private computePipeline(
    scope: TenantScope,
    declaration: TaxDeclaration
  ): { stages: Partial<TaxDeclaration>; breakdown: TaxPipelineStage[]; projection: MonthlyTdsProjection } {
    const fy = declaration.financialYear;
    const asOf = fyEndDate(fy);
    const rows = this.payRuleRepository
      .listRateRows(scope, "TAX_SLAB")
      .filter((row) => row.isActive && row.regime === declaration.regime && row.financialYear === fy && windowCovers(row.effectiveFrom, row.effectiveTo, asOf));
    const slabRows = rows.filter((row) => (row.keyCode ?? KEY_SLAB) === KEY_SLAB).sort((left, right) => (left.slabMinCents ?? 0) - (right.slabMinCents ?? 0));
    if (slabRows.length === 0) {
      // FR-07 failure handling: no effective slab rows for the regime/FY fails closed (422).
      throw new FoundationError("ERR-G10-TAXSLAB-NOTFOUND", `No effective TAX_SLAB rows for regime ${declaration.regime} in ${fy}`, {
        details: { regime: declaration.regime, financialYear: fy, tableType: "TAX_SLAB" },
      });
    }
    // Stage 0 — projected annual gross from the immutable payslip_lines ledger (FR-07 AC4)
    // + perquisites (BR5) + Form-12B previous-employer income (AC6).
    const fyPeriods = periodsOfFinancialYear(fy);
    const survivingPayslips = this.payrollEngineRepository
      .listPayslipsForEmployee(scope, declaration.employeeId)
      .filter((payslip) => payslip.status === "PUBLISHED" && fyPeriods.includes(payslip.period));
    const paidPeriods = [...new Set(survivingPayslips.map((payslip) => payslip.period))].sort();
    const remainingMonths = FY_MONTH_COUNT - paidPeriods.length;
    const fyLines = this.fyTdsLedger(scope, declaration.employeeId, fy);
    const earnedToDatePaise = fyLines
      .filter((line) => line.lineType === "EARNING" || line.lineType === "ARREAR" || line.lineType === "ROUNDING_ADJUSTMENT")
      .reduce((total, line) => total + line.amountCents, 0);
    const latestPayslip = survivingPayslips.sort((left, right) => left.period.localeCompare(right.period) || left.version - right.version).at(-1);
    const projectedSalaryPaise = earnedToDatePaise + (latestPayslip ? latestPayslip.grossCents * remainingMonths : 0);
    const previousEmployerIncomePaise = declaration.previousEmployerIncome?.incomePaise ?? 0;
    const grossTaxablePaise = projectedSalaryPaise + declaration.perquisiteTotalPaise + previousEmployerIncomePaise;
    // Stage 1 — standard deduction (effective-dated rate row, regime-dimensioned).
    const standardDeductionPaise = Math.min(grossTaxablePaise, flatOf(rows, KEY_STD_DEDUCTION));
    // Stage 2 — Chapter VI-A: OLD regime only (BR1: the new regime ignores most exemptions);
    // declared amounts CLAMP to the rate-row caps (FR-07 failure handling: never rejected).
    let chapterViaTotalPaise = 0;
    if (declaration.regime === "OLD") {
      const cap80c = flatOf(rows, KEY_CAP_80C, Number.MAX_SAFE_INTEGER);
      const cap80d = flatOf(rows, KEY_CAP_80D, Number.MAX_SAFE_INTEGER);
      chapterViaTotalPaise =
        Math.min(declaration.declared80cPaise, cap80c) +
        Math.min(declaration.declared80dPaise, cap80d) +
        declaration.hraExemptionPaise +
        declaration.homeLoanInterestPaise;
    }
    const taxableIncomePaise = Math.max(0, grossTaxablePaise - standardDeductionPaise - chapterViaTotalPaise);
    // Stage 3 — slab tax over the effective-dated slab rows.
    const slabTaxPaise = slabTaxOn(slabRows, taxableIncomePaise);
    // Stage 4 — surcharge with marginal relief (BR4): the increment over the threshold tax
    // may not exceed the income increment over the threshold.
    const surchargeRows = rows
      .filter((row) => row.keyCode === KEY_SURCHARGE)
      .sort((left, right) => (left.slabMinCents ?? 0) - (right.slabMinCents ?? 0));
    let surchargePaise = 0;
    let marginalReliefPaise = 0;
    const band = surchargeRows.filter((row) => taxableIncomePaise >= (row.slabMinCents ?? 0)).at(-1);
    if (band) {
      const rawSurcharge = mulDivRound(slabTaxPaise, band.ratePctBps ?? 0, 10000);
      const thresholdIncomePaise = band.slabMinCents ?? 0;
      const taxAtThresholdPaise = slabTaxOn(slabRows, thresholdIncomePaise);
      const lowerBand = surchargeRows.filter((row) => (row.slabMinCents ?? 0) < thresholdIncomePaise).at(-1);
      const thresholdSurchargePaise = lowerBand ? mulDivRound(taxAtThresholdPaise, lowerBand.ratePctBps ?? 0, 10000) : 0;
      const ceilingPaise = taxAtThresholdPaise + thresholdSurchargePaise + (taxableIncomePaise - thresholdIncomePaise);
      const excessPaise = slabTaxPaise + rawSurcharge - ceilingPaise;
      marginalReliefPaise = Math.max(0, Math.min(rawSurcharge, excessPaise));
      surchargePaise = rawSurcharge - marginalReliefPaise;
    }
    // Stage 5 — health & education cess on (slab tax + surcharge). BRD FR-07 names the 4%
    // cess; the actual rate is the effective-dated CESS rate row, never a constant here.
    const cessRow = rows.find((row) => row.keyCode === KEY_CESS);
    const cessPaise = mulDivRound(slabTaxPaise + surchargePaise, cessRow?.ratePctBps ?? 0, 10000);
    // Stage 6 — section 87A rebate (per-regime threshold + cap from the rate row).
    const taxBeforeRebatePaise = slabTaxPaise + surchargePaise + cessPaise;
    const rebateRow = rows.find((row) => row.keyCode === KEY_REBATE_87A);
    const rebate87aPaise =
      rebateRow && taxableIncomePaise <= (rebateRow.slabMaxCents ?? 0) ? Math.min(taxBeforeRebatePaise, rebateRow.flatAmountCents ?? 0) : 0;
    // Stage 7 — section 89(1)/Form-10E relief for cross-FY arrears (AC7).
    const relief891Paise = Math.min(Math.max(0, taxBeforeRebatePaise - rebate87aPaise), declaration.relief891?.reliefPaise ?? 0);
    const projectedAnnualTaxPaise = Math.max(0, taxBeforeRebatePaise - rebate87aPaise - relief891Paise);
    // Stage 8 — FR-07 BR2: TDS = (projected annual tax − YTD TDS from the ledger − Form-12B
    // TDS) / remaining months; YTD comes ONLY from payslip_lines (VAL-G10-YTD-DERIVE).
    const ytdTdsPaise = fyLines
      .filter((line) => line.componentCode === TDS_COMPONENT_CODE && line.lineType === "DEDUCTION")
      .reduce((total, line) => total + line.amountCents, 0);
    const previousEmployerTdsPaise = declaration.previousEmployerIncome?.tdsPaise ?? 0;
    const balancePaise = projectedAnnualTaxPaise - ytdTdsPaise - previousEmployerTdsPaise;
    const monthlyTdsPaise = remainingMonths > 0 ? Math.max(0, mulDivRound(balancePaise, 1, remainingMonths)) : 0;
    const projection: MonthlyTdsProjection = {
      validation: "VAL-G10-YTD-DERIVE",
      ytdTdsPaise,
      previousEmployerTdsPaise,
      remainingMonths,
      monthlyTdsPaise,
    };
    const breakdown: TaxPipelineStage[] = [
      { stage: "gross_taxable", amountPaise: grossTaxablePaise },
      { stage: "standard_deduction", amountPaise: standardDeductionPaise },
      { stage: "chapter_via_total", amountPaise: chapterViaTotalPaise },
      { stage: "taxable_income", amountPaise: taxableIncomePaise },
      { stage: "slab_tax", amountPaise: slabTaxPaise },
      { stage: "surcharge", amountPaise: surchargePaise },
      { stage: "marginal_relief", amountPaise: marginalReliefPaise },
      { stage: "cess", amountPaise: cessPaise },
      { stage: "rebate_87a", amountPaise: rebate87aPaise },
      { stage: "relief_89_1", amountPaise: relief891Paise },
      { stage: "projected_annual_tax", amountPaise: projectedAnnualTaxPaise },
      { stage: "monthly_tds", amountPaise: monthlyTdsPaise },
    ];
    return {
      stages: {
        grossTaxablePaise,
        standardDeductionPaise,
        chapterViaTotalPaise,
        taxableIncomePaise,
        slabTaxPaise,
        surchargePaise,
        marginalReliefPaise,
        cessPaise,
        rebate87aPaise,
        relief891Paise,
        projectedAnnualTaxPaise,
        monthlyTdsPaise,
      },
      breakdown,
      projection,
    };
  }

  /** Surviving (PUBLISHED payslip) lines for the employee restricted to the FY periods. */
  private fyTdsLedger(scope: TenantScope, employeeId: string, financialYear: string): EnginePayslipLine[] {
    const fyPeriods = new Set(periodsOfFinancialYear(financialYear));
    const survivingIds = new Set(
      this.payrollEngineRepository
        .listPayslipsForEmployee(scope, employeeId)
        .filter((payslip) => payslip.status === "PUBLISHED" && fyPeriods.has(payslip.period))
        .map((payslip) => payslip.id)
    );
    return this.payrollEngineRepository.listLinesForEmployee(scope, employeeId).filter((line) => survivingIds.has(line.payslipId));
  }

  /** FY TDS deduction lines for one employee (the Form-16 AC1 tie-out source). */
  private fyTdsLines(scope: TenantScope, employeeId: string, financialYear: string): EnginePayslipLine[] {
    return this.fyTdsLedger(scope, employeeId, financialYear).filter(
      (line) => line.componentCode === TDS_COMPONENT_CODE && line.lineType === "DEDUCTION"
    );
  }

  /** FY TDS deduction lines across all employees (Part A reconciliation + 24Q source). */
  private fyTdsLinesAllEmployees(scope: TenantScope, financialYear: string): EnginePayslipLine[] {
    return periodsOfFinancialYear(financialYear).flatMap((period) =>
      this.survivingLines(scope, { period }).filter((line) => line.componentCode === TDS_COMPONENT_CODE && line.lineType === "DEDUCTION")
    );
  }

  /** All surviving (PUBLISHED payslip) lines for a period across employees, run-by-run. */
  private survivingLines(scope: TenantScope, filter: { period: string }): EnginePayslipLine[] {
    const lines: EnginePayslipLine[] = [];
    for (const run of this.payrollEngineRepository.listRuns(scope)) {
      if (run.period !== filter.period) {
        continue;
      }
      for (const payslip of this.payrollEngineRepository.listPayslipsForRun(scope, run.id)) {
        if (payslip.status !== "PUBLISHED") {
          continue;
        }
        lines.push(...this.payrollEngineRepository.listLinesForPayslip(scope, payslip.id));
      }
    }
    return lines;
  }

  private requireDeclaration(scope: TenantScope, employeeId: string, financialYear: string): TaxDeclaration {
    requireTenantScope(scope);
    const declaration = this.repository.findDeclaration(scope, employeeId, financialYear);
    if (!declaration) {
      throw new FoundationError("NOT_FOUND", "Tax declaration not found");
    }
    return declaration;
  }

  private requireRemittance(scope: TenantScope, remittanceId: string): StatutoryRemittance {
    requireTenantScope(scope);
    const remittance = this.repository.findRemittance(scope, remittanceId);
    if (!remittance) {
      throw new FoundationError("NOT_FOUND", "Statutory remittance not found");
    }
    return remittance;
  }
}

/** Ledger component codes per remittance scheme (deducted_total derives from these lines). */
function componentForScheme(scheme: RemittanceScheme): string {
  switch (scheme) {
    case "TDS":
      return TDS_COMPONENT_CODE;
    case "PT":
      return "PT";
    case "GPF":
      return "GPF";
    case "CPF":
      return "CPF";
    case "NPS":
      return "NPS";
    case "PENSION":
      return "PENSION";
    case "INSURANCE":
      return "INSURANCE";
  }
}

/** Flat amount of a keyed TAX_SLAB row (STD_DEDUCTION/CAP_80C/CAP_80D...), with default. */
function flatOf(rows: RateTableRow[], keyCode: string, fallback = 0): number {
  const row = rows.find((item) => item.keyCode === keyCode);
  return row?.flatAmountCents ?? fallback;
}

/** Progressive slab tax in integer paise over ordered effective-dated slab rows. */
function slabTaxOn(slabRows: RateTableRow[], taxableIncomePaise: number): number {
  let taxPaise = 0;
  for (const slab of slabRows) {
    const lower = slab.slabMinCents ?? 0;
    if (taxableIncomePaise <= lower) {
      continue;
    }
    const upper = slab.slabMaxCents ?? taxableIncomePaise;
    const portionPaise = Math.min(taxableIncomePaise, upper) - lower;
    taxPaise += mulDivRound(portionPaise, slab.ratePctBps ?? 0, 10000);
  }
  return taxPaise;
}

/** Integer money helper: round(amount * numerator / denominator) with safe-integer checks. */
function mulDivRound(amountPaise: number, numerator: number, denominator: number): number {
  if (denominator === 0) {
    throw new FoundationError("INTERNAL", "Division by zero in tax math");
  }
  const product = amountPaise * numerator;
  if (!Number.isSafeInteger(product)) {
    throw new FoundationError("INTERNAL", "Tax math overflows deterministic integer arithmetic");
  }
  return Math.round(product / denominator);
}

/** Indian FY format: '2026-27' (April 2026 .. March 2027). */
function assertFinancialYear(financialYear: string): void {
  if (!/^\d{4}-\d{2}$/.test(financialYear)) {
    throw new FoundationError("VALIDATION_FAILED", "financialYear must use YYYY-YY (e.g. 2026-27)", { field: "financialYear" });
  }
  const startYear = Number(financialYear.slice(0, 4));
  const endSuffix = Number(financialYear.slice(5));
  if ((startYear + 1) % 100 !== endSuffix) {
    throw new FoundationError("VALIDATION_FAILED", "financialYear years must be consecutive (e.g. 2026-27)", { field: "financialYear" });
  }
}

/** The 12 YYYY-MM periods of an FY: April of the start year through March of the next. */
export function periodsOfFinancialYear(financialYear: string): string[] {
  assertFinancialYear(financialYear);
  const startYear = Number(financialYear.slice(0, 4));
  const periods: string[] = [];
  for (let offset = 0; offset < FY_MONTH_COUNT; offset += 1) {
    const month = ((3 + offset) % 12) + 1;
    const year = month >= 4 ? startYear : startYear + 1;
    periods.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return periods;
}

/** FY of a YYYY-MM period (Apr..Mar): '2026-05' -> '2026-27'; '2027-01' -> '2026-27'. */
export function financialYearOfPeriod(period: string): string {
  const [yearText, monthText] = period.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** Form-24Q quarters of an FY (Q1 Apr-Jun .. Q4 Jan-Mar). */
export function fyQuarters(financialYear: string): { quarter: "Q1" | "Q2" | "Q3" | "Q4"; periods: string[] }[] {
  const periods = periodsOfFinancialYear(financialYear);
  return [
    { quarter: "Q1", periods: periods.slice(0, 3) },
    { quarter: "Q2", periods: periods.slice(3, 6) },
    { quarter: "Q3", periods: periods.slice(6, 9) },
    { quarter: "Q4", periods: periods.slice(9, 12) },
  ];
}

/** Last day of the FY — the as-of date for effective-dated TAX_SLAB row resolution. */
function fyEndDate(financialYear: string): string {
  const startYear = Number(financialYear.slice(0, 4));
  return `${startYear + 1}-03-31`;
}

/** Today's ISO date — only the DEFAULT for cutoff-lock checks; callers pass asOf explicitly. */
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
