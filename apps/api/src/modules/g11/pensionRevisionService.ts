import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";
import { mulDivFloor } from "./pensionBenefitRepository";
import { PenPensioner, PensionerLifecycleRepository, monthKeysBetween } from "./pensionerLifecycleRepository";
import {
  G11RevisionType,
  PenRevisionBatch,
  PenRevisionLine,
  PensionRevisionRepository,
} from "./pensionRevisionRepository";
import { PensionRuleService } from "./pensionRuleService";

/**
 * PH-15B — BRD G11 FR-13 revision engine (pen_revisions) over the pensioner master:
 *   - DA-relief batches recompute Dearness Relief from the effective-dated E30
 *     pen_da_relief_rates row (BR1 — SNAPSHOT onto the batch header, never an inline
 *     constant); pay-commission batches re-fix basic pension by the batch fitment factor;
 *   - old vs new and MONTH-WISE arrears from the effective date are computed per pensioner
 *     with trace (AC2/AC3); family pensioners are revised by the same batch (BR2);
 *   - DETERMINISM: the same batch inputs (snapshot rule row / factor, pensioner base,
 *     effective date) produce identical per-pensioner deltas on recompute — line ids derive
 *     from revision_no + pensioner_no so a recompute is deep-equal (AC3);
 *   - the batch requires P01 approval (SoD) before APPLY (AC3) and is IMMUTABLE once
 *     applied (AC4/P05): any mutation of an APPLIED batch fails with
 *     ERR-G11-REVISION-IMMUTABLE (409) — corrections create a NEW batch;
 *   - when events share an effective date they apply strictly in the §16.9 order
 *     (pay-commission re-fix -> restoration -> DA -> age increment), recorded in calc_trace
 *     (AC6/IR18).
 * All money is integer paise.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** IR18 / BRD §16.9 — the deterministic same-effective-date application order. */
export const SECTION_16_9_APPLICATION_ORDER: Readonly<Record<G11RevisionType, number>> = {
  PAY_COMMISSION: 1,
  RESTORATION: 2,
  DA: 3,
  AGE_INCREMENT: 4,
};

export class PensionRevisionService {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly pensionRules: PensionRuleService,
    private readonly lifecycleRepository: PensionerLifecycleRepository,
    private readonly repository: PensionRevisionRepository
  ) {}

  /**
   * FR-13 — create a revision batch header. The batch INPUTS are snapshot here: a DA batch
   * resolves and pins the effective E30 pen_da_relief_rates row (BR1 — fail closed when no
   * row covers the effective date); a PAY_COMMISSION batch pins its fitment factor (x 10^4).
   */
  createBatch(
    actor: ActorContext,
    input: { revisionType: G11RevisionType; effectiveDate: string; fitmentFactorTenThousandths?: number }
  ): PenRevisionBatch {
    this.authorization.check(actor, "g11.revision.write", actor);
    if (!ISO_DATE.test(input.effectiveDate)) {
      throw new FoundationError("VALIDATION_FAILED", "effectiveDate must be an ISO date (YYYY-MM-DD)", { field: "effectiveDate" });
    }
    if (input.revisionType !== "DA" && input.revisionType !== "PAY_COMMISSION") {
      throw new FoundationError("VALIDATION_FAILED", "revisionType must be DA or PAY_COMMISSION for a batch run", { field: "revisionType" });
    }
    let daRateRef: string | undefined;
    let daPercentBps: number | undefined;
    let fitmentFactorTenThousandths: number | undefined;
    if (input.revisionType === "DA") {
      // BR1: the DA parameter is the effective-dated pen_da_relief_rates row for PENSIONERS,
      // resolved as-of the effective date and snapshot onto the batch (determinism input).
      const daRate = this.pensionRules.resolveDaReliefRate(actor, input.effectiveDate, "PENSIONER");
      daRateRef = daRate.id;
      daPercentBps = daRate.daPercentBps;
    } else {
      const factor = input.fitmentFactorTenThousandths;
      if (factor === undefined || !Number.isInteger(factor) || factor <= 0) {
        throw new FoundationError("VALIDATION_FAILED", "PAY_COMMISSION batches require fitmentFactorTenThousandths (re-fixation factor x 10^4)", {
          field: "fitmentFactorTenThousandths",
        });
      }
      fitmentFactorTenThousandths = factor;
    }
    const batch: PenRevisionBatch = {
      id: nextId("pen-revision", this.repository.countBatches()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      revisionNo: `REV/${input.effectiveDate.slice(0, 4)}/${String(this.repository.countBatches() + 1).padStart(5, "0")}`,
      revisionType: input.revisionType,
      effectiveDate: input.effectiveDate,
      isBatch: true,
      daRateRef,
      daPercentBps,
      fitmentFactorTenThousandths,
      calcTrace: {
        // AC6/IR18: the §16.9 ordering the batch will apply under, recorded up front.
        marker: "SECTION_16_9_ORDER",
        applicationOrder: SECTION_16_9_APPLICATION_ORDER[input.revisionType],
        applicationOrderTable: { ...SECTION_16_9_APPLICATION_ORDER },
      },
      makerUserId: actor.userId,
      status: "DRAFT",
    };
    this.repository.insertBatch(batch);
    this.audit.recordMutation(actor, {
      action: "G11_REVISION_BATCH_CREATED",
      subjectRef: `pen_revisions:${batch.id}`,
      metadata: { revisionNo: batch.revisionNo, revisionType: input.revisionType, effectiveDate: input.effectiveDate, daRateRef },
    });
    return { ...batch, calcTrace: { ...batch.calcTrace } };
  }

  /**
   * FR-13 AC1/AC2/AC3 — compute per-pensioner old vs new + month-wise arrears from the
   * effective date. DETERMINISTIC: everything derives from the snapshot batch inputs and
   * the pensioner base, and line ids derive from revision_no + pensioner_no, so recomputing
   * the same batch yields deep-equal lines. Recompute is legal only while NOT applied.
   */
  computeBatch(actor: ActorContext, batchId: string, input: { asOf: string }): PenRevisionLine[] {
    this.authorization.check(actor, "g11.revision.write", actor);
    const batch = this.requireMutableBatch(actor, batchId);
    if (!ISO_DATE.test(input.asOf)) {
      throw new FoundationError("VALIDATION_FAILED", "asOf must be an ISO date (YYYY-MM-DD)", { field: "asOf" });
    }
    if (input.asOf < batch.effectiveDate) {
      throw new FoundationError("VALIDATION_FAILED", "asOf must be on or after the batch effective date", { field: "asOf" });
    }
    // AC2: month-wise arrears cover every month from the effective date to the run date.
    const arrearMonthKeys = monthKeysBetween(batch.effectiveDate, input.asOf);
    const applicationOrder = SECTION_16_9_APPLICATION_ORDER[batch.revisionType];
    // BR2: the cohort covers self AND family pensioners; suspension holds disbursement,
    // not revision. Sorted by pensioner_no for a stable, deterministic line order.
    const cohort = this.lifecycleRepository
      .listPensioners(actor)
      .filter(
        (pensioner) =>
          pensioner.lifecycleStatus === "ACTIVE" ||
          pensioner.lifecycleStatus === "FAMILY_PENSION_ACTIVE" ||
          pensioner.lifecycleStatus === "SUSPENDED_NO_LC"
      )
      .sort((left, right) => (left.pensionerNo < right.pensionerNo ? -1 : 1));
    const lines = cohort.map((pensioner) => this.computeLine(batch, pensioner, arrearMonthKeys, applicationOrder));
    this.repository.replaceLines(actor, batch.id, lines);
    batch.status = "COMPUTED";
    batch.calcTrace = { ...batch.calcTrace, computedAsOf: input.asOf, arrearMonths: arrearMonthKeys.length, cohortSize: lines.length };
    this.repository.saveBatch(batch);
    this.audit.recordMutation(actor, {
      action: "G11_REVISION_BATCH_COMPUTED",
      subjectRef: `pen_revisions:${batch.id}`,
      metadata: { revisionNo: batch.revisionNo, cohortSize: lines.length, arrearMonths: arrearMonthKeys.length, applicationOrder },
    });
    return lines.map((line) => ({ ...line, calcTrace: { ...line.calcTrace } }));
  }

  /** FR-13 AC3 — P01 approval gate before APPLY, with maker/checker SoD. */
  approveBatch(actor: ActorContext, batchId: string): PenRevisionBatch {
    this.authorization.check(actor, "g11.revision.approve", actor);
    const batch = this.requireMutableBatch(actor, batchId);
    if (batch.status !== "COMPUTED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a COMPUTED revision batch can be approved");
    }
    if (batch.makerUserId === actor.userId) {
      throw new FoundationError("PRECONDITION_FAILED", "REVISION_SOD blocks the batch maker from approving it", { details: { marker: "REVISION_SOD" } });
    }
    batch.status = "APPROVED";
    batch.approvedByUserId = actor.userId;
    this.repository.saveBatch(batch);
    this.audit.recordMutation(actor, {
      action: "G11_REVISION_BATCH_APPROVED",
      subjectRef: `pen_revisions:${batch.id}`,
      metadata: { revisionNo: batch.revisionNo, marker: "REVISION_SOD" },
    });
    return { ...batch, calcTrace: { ...batch.calcTrace } };
  }

  /**
   * FR-13 AC3/AC4 — atomic APPLY (requires prior approval). Pensioner masters take the new
   * basic/relief, lines and header flip to APPLIED in one transaction, and the batch becomes
   * IMMUTABLE: any later mutation fails with ERR-G11-REVISION-IMMUTABLE.
   */
  applyBatch(actor: ActorContext, batchId: string, input: { appliedOn: string; jobRunRef?: string }): PenRevisionBatch {
    this.authorization.check(actor, "g11.revision.approve", actor);
    const batch = this.requireMutableBatch(actor, batchId);
    if (batch.status !== "APPROVED") {
      throw new FoundationError("PRECONDITION_FAILED", "A revision batch requires P01 approval before APPLY (FR-13 AC3)");
    }
    if (!ISO_DATE.test(input.appliedOn)) {
      throw new FoundationError("VALIDATION_FAILED", "appliedOn must be an ISO date (YYYY-MM-DD)", { field: "appliedOn" });
    }
    const lines = this.repository.listLines(actor, batch.id);
    const pensioners: PenPensioner[] = [];
    for (const line of lines) {
      const pensioner = this.lifecycleRepository.findPensionerById(actor, line.pensionerId);
      if (!pensioner) {
        // FR-13 failure handling: apply must not partially commit against a missing master.
        throw new FoundationError("CONFLICT", "Revision line references a pensioner that no longer exists — apply aborted", {
          details: { batchId: batch.id, pensionerId: line.pensionerId },
        });
      }
      pensioner.currentPensionBasicPaise = line.newBasicPaise;
      pensioner.currentDaReliefPaise = line.newDaReliefPaise;
      pensioners.push(pensioner);
      line.status = "APPLIED";
    }
    batch.status = "APPLIED";
    batch.appliedOn = input.appliedOn;
    batch.jobRunRef = input.jobRunRef ?? `JOB-G11-PENSION-RUN:${batch.revisionNo}`;
    // AC4: masters + lines + header persist atomically (one transaction, no partial commit).
    this.repository.applyBatch(batch, lines, pensioners);
    this.audit.recordMutation(actor, {
      action: "G11_REVISION_BATCH_APPLIED",
      subjectRef: `pen_revisions:${batch.id}`,
      metadata: { revisionNo: batch.revisionNo, jobRunRef: batch.jobRunRef, appliedOn: input.appliedOn, lines: lines.length },
    });
    return { ...batch, calcTrace: { ...batch.calcTrace } };
  }

  getBatch(scope: TenantScope, batchId: string): PenRevisionBatch {
    const batch = this.requireBatch(scope, batchId);
    return { ...batch, calcTrace: { ...batch.calcTrace } };
  }

  listLines(scope: TenantScope, batchId: string): PenRevisionLine[] {
    this.requireBatch(scope, batchId);
    return this.repository.listLines(scope, batchId).map((line) => ({ ...line, calcTrace: { ...line.calcTrace } }));
  }

  /** One pensioner's delta under the snapshot batch inputs — pure integer paise math. */
  private computeLine(batch: PenRevisionBatch, pensioner: PenPensioner, arrearMonthKeys: string[], applicationOrder: number): PenRevisionLine {
    const oldBasicPaise = pensioner.currentPensionBasicPaise;
    const oldDaReliefPaise = pensioner.currentDaReliefPaise;
    let newBasicPaise: number;
    let newDaReliefPaise: number;
    let formula: string;
    if (batch.revisionType === "DA") {
      // AC1: DA batch recomputes Dearness Relief on the unchanged basic from the snapshot
      // E30 rate row — M11_COMPUTES_FULL recomputes the full monthly figure.
      newBasicPaise = oldBasicPaise;
      newDaReliefPaise = mulDivFloor(oldBasicPaise, batch.daPercentBps ?? 0, 10000);
      formula = `DA relief = basic x ${batch.daPercentBps} bps from pen_da_relief_rates ${batch.daRateRef} (FR-13 AC1)`;
    } else {
      // AC2: pay-commission batch RE-FIXES basic pension by the snapshot fitment factor;
      // relief follows in its own DA batch per the §16.9 ordering.
      newBasicPaise = mulDivFloor(oldBasicPaise, batch.fitmentFactorTenThousandths ?? 10000, 10000);
      newDaReliefPaise = oldDaReliefPaise;
      formula = `pay-commission re-fix = old basic x ${batch.fitmentFactorTenThousandths} / 10^4 (FR-13 AC2)`;
    }
    const oldMonthlyPaise = oldBasicPaise + oldDaReliefPaise;
    const newMonthlyPaise = newBasicPaise + newDaReliefPaise;
    const monthlyDeltaPaise = newMonthlyPaise - oldMonthlyPaise;
    const arrearsPaise = monthlyDeltaPaise * arrearMonthKeys.length;
    return {
      id: `pen-revision-line:${batch.revisionNo}:${pensioner.pensionerNo}`,
      tenantId: batch.tenantId,
      entityId: batch.entityId,
      batchId: batch.id,
      revisionNo: batch.revisionNo,
      pensionerId: pensioner.id,
      pensionerNo: pensioner.pensionerNo,
      oldBasicPaise,
      newBasicPaise,
      oldDaReliefPaise,
      newDaReliefPaise,
      oldMonthlyPaise,
      newMonthlyPaise,
      monthlyDeltaPaise,
      arrearMonths: arrearMonthKeys.length,
      arrearsPaise,
      applicationOrder,
      calcTrace: {
        formula,
        applicationOrder,
        // AC2: the month-wise arrear ledger from the effective date.
        monthWiseArrears: arrearMonthKeys.map((month) => ({ month, arrearPaise: monthlyDeltaPaise })),
      },
      status: "COMPUTED",
    };
  }

  private requireBatch(scope: TenantScope, batchId: string): PenRevisionBatch {
    requireTenantScope(scope);
    const batch = this.repository.findBatchById(scope, batchId);
    if (!batch) {
      throw new FoundationError("NOT_FOUND", "Revision batch not found");
    }
    return batch;
  }

  /** AC4/P05: an APPLIED batch is immutable — mutation attempts fail closed. */
  private requireMutableBatch(scope: TenantScope, batchId: string): PenRevisionBatch {
    const batch = this.requireBatch(scope, batchId);
    if (batch.status === "APPLIED") {
      throw new FoundationError("ERR-G11-REVISION-IMMUTABLE", "Applied revision batches are immutable — corrections create a new batch (FR-13 AC4)", {
        details: { batchId: batch.id, revisionNo: batch.revisionNo, appliedOn: batch.appliedOn },
      });
    }
    return batch;
  }
}
