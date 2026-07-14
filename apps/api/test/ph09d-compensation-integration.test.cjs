const test = require("node:test");
const assert = require("node:assert/strict");

// PH-09D oracle tests — G10 compensation integration, SoD, and provenance:
// - FR-14/15 bank disbursement tie-out on real ledger rows: Σ disbursed + Σ held + Σ failed
//   = run net in integer paise, NO tolerance window; an induced residual (a written-off
//   suspense hold) blocks with ERR-G10-RECON-TIEOUT.
// - FR-15 reconciliation sign-off SoD by ACTOR IDENTITY: the signer must differ from the
//   run maker and approver; a same-actor sign-off rejects ERR-G10-RECON-UNSIGNED, and
//   disbursement cannot complete behind an unsigned reconciliation.
// - FR-09 recovery scheduling from a REAL G09 penalty order, bounded by the net-pay floor
//   + the CPC s.60 attachment cap (seeded configuration with a recorded basis — never an
//   invented fraction); an over-bound recovery raises ERR-G10-RECOVERY-BARRED and books
//   the residue into deduction_carryforwards.
// - FR-20 FnF consolidated settlement (fnf_settlements) pulling the open loans_advances
//   and deduction_carryforwards into one record with the AC2 net equation and FNF SoD.
// - FR-23 SR provenance: PAY_FIXATION / ANNUAL_INCREMENT post via the G12 ingest contract
//   with a deterministic fact_key; a replayed posting is a SEMANTIC duplicate (no second
//   ledger row). G10 never writes the SR ledger directly.
// - G11 FR-14 pre-credit gate: disbursement without an ACTIVE PASSED
//   pen_bank_account_verifications row fails closed with ERR-G11-ACCOUNT-VERIFY.
// All amounts are INTEGER paise; rates are integer basis points (test fixture values,
// not statutory claims).

const { createFoundationServices, FoundationError, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph09d-maker",
    actorUserId: "user-ph09d-maker",
    permissions: ["*"],
    roles: ["payroll_officer"],
    fieldGrants: [],
    correlationId: "corr-ph09d",
    ...extra,
  };
}

function approver() {
  return actor({ userId: "user-ph09d-approver", actorUserId: "user-ph09d-approver" });
}

function signer() {
  return actor({ userId: "user-ph09d-recon-signer", actorUserId: "user-ph09d-recon-signer" });
}

/** Minimal PH-09B rule fixture: BASIC (FLAT) + NPS (FORMULA deduction) — integer paise. */
function seedRules(services, employees) {
  const maker = actor();
  services.payRules.createPayComponent(maker, { componentCode: "BASIC", name: "Basic Pay", category: "EARNING", calcMethod: "FLAT" });
  services.payRules.createPayComponent(maker, { componentCode: "NPS", name: "NPS Contribution", category: "DEDUCTION", calcMethod: "FORMULA" });
  services.payRules.createPayRule(maker, { componentCode: "BASIC", calcMethod: "FLAT", computationOrder: 1, effectiveFrom: "2026-01-01" });
  services.payRules.createPayRule(maker, {
    componentCode: "NPS",
    calcMethod: "FORMULA",
    formulaExpression: "ROUND(BASIC / 10000 * RATE(NPS_RATE))",
    computationOrder: 2,
    effectiveFrom: "2026-01-01",
  });
  services.payRules.addRateRow(maker, { tableType: "NPS_RATE", ratePctBps: 1000, effectiveFrom: "2026-01-01" });
  for (const { employeeId, basicPaise } of employees) {
    services.payrollEngine.enrolEmployee(maker, {
      employeeId,
      stateOfPosting: "KA",
      componentAmountsCents: { BASIC: basicPaise },
      effectiveFrom: "2026-01-01",
    });
  }
}

/** Drive one period from run creation through lock; returns the LOCKED run. */
function runPeriodToLock(services, period) {
  const maker = actor();
  const run = services.payrollEngine.createEngineRun(maker, { period, runMode: "FINAL" });
  services.payrollEngine.snapshotRunInputs(maker, run.id);
  services.payrollEngine.computeEngineRun(maker, run.id);
  services.payrollEngine.approveEngineRun(approver(), run.id);
  services.payrollEngine.lockEngineRun(maker, run.id);
  return services.payrollEngine.getEngineRun(maker, run.id);
}

/** G09 due-process shortcut to a served penalty order for the seeded employee. */
function imposePenaltyOrder(services) {
  const maker = actor();
  const opened = services.disciplinary.openCase(maker, {
    chargedEmployeeId: ph03Ids.employee,
    disciplinaryAuthorityId: ph03Ids.manager,
    allegations: "Unauthorised absence",
  });
  services.disciplinary.serveChargeMemo(maker, opened.id, { articles: ["Article I"], servedOn: "2026-08-01" });
  services.disciplinary.recordInquiryReport(maker, opened.id, { findings: "PROVED", reportDate: "2026-08-20" });
  return services.disciplinary.imposePenalty(maker, opened.id, {
    penaltyType: "MAJOR_PENALTY",
    orderDate: "2026-08-25",
    reason: "Charge proved",
    idempotencyKey: "idem-ph09d-penalty-001",
  }).penaltyOrder;
}

test("PH-09D FR-14/15: disbursed + held + failed = run net on real ledger rows; sign-off SoD gates completion", async () => {
  const services = createFoundationServices();
  const maker = actor();
  seedRules(services, [
    { employeeId: ph03Ids.employee, basicPaise: 3100000 },
    { employeeId: ph03Ids.manager, basicPaise: 2000000 },
  ]);
  const run = runPeriodToLock(services, "2026-09");
  assert.ok(run.netTotalCents > 0);

  // FR-14: the manager's account is invalid — the net pay parks in disbursement_holds (E31).
  const prepared = services.compensationIntegration.prepareBankDisbursement(maker, run.id, {
    bankBatchRef: "PP-2026-09-0001",
    accountStatusByEmployee: { [ph03Ids.manager]: "INVALID_ACCOUNT" },
  });
  assert.equal(prepared.holds.length, 1);
  assert.equal(prepared.holds[0].reason, "INVALID_ACCOUNT");
  assert.ok(prepared.disbursement.disbursedTotalPaise > 0);
  assert.ok(prepared.disbursement.heldTotalPaise > 0);
  // The tie-out equation over the split (VAL-G10-TIEOUT): disbursed + held + failed = run net.
  assert.equal(
    prepared.disbursement.disbursedTotalPaise + prepared.disbursement.heldTotalPaise + prepared.disbursement.failedTotalPaise,
    run.netTotalCents
  );

  const reconciliation = services.compensationIntegration.reconcileDisbursement(maker, run.id);
  assert.equal(reconciliation.status, "BALANCED");
  assert.equal(reconciliation.residualPaise, 0);
  assert.equal(reconciliation.validation, "VAL-G10-TIEOUT");
  assert.equal(reconciliation.disbursedTotalPaise + reconciliation.heldTotalPaise + reconciliation.failedTotalPaise, reconciliation.runNetPaise);

  // NEGATIVE SoD: the run maker signing their own reconciliation is rejected — actor
  // identity, not a boolean flag (ERR-G10-RECON-UNSIGNED).
  assert.throws(
    () => services.compensationIntegration.signOffReconciliation(maker, run.id),
    (error) => error instanceof FoundationError && error.code === "ERR-G10-RECON-UNSIGNED" && String(error.details.marker) === "PAYROLL_SOD"
  );
  // The run approver is equally barred from signing.
  assert.throws(
    () => services.compensationIntegration.signOffReconciliation(approver(), run.id),
    (error) => error instanceof FoundationError && error.code === "ERR-G10-RECON-UNSIGNED"
  );
  // Unsigned reconciliation blocks disbursement completion (FR-16 AC1 gate).
  assert.throws(
    () => services.compensationIntegration.completeDisbursement(maker, run.id),
    (error) => error instanceof FoundationError && error.code === "ERR-G10-RECON-UNSIGNED"
  );

  const signed = services.compensationIntegration.signOffReconciliation(signer(), run.id);
  assert.equal(signed.status, "SIGNED_OFF");
  assert.equal(signed.signedByUserId, "user-ph09d-recon-signer");
  const completed = services.compensationIntegration.completeDisbursement(maker, run.id);
  assert.equal(completed.status, "COMPLETED");
  assert.ok(services.payrollEngine.getEngineRun(maker, run.id).transmittedAt);
});

test("PH-09D NEGATIVE FR-15: an induced residual (written-off hold) blocks with ERR-G10-RECON-TIEOUT", async () => {
  const services = createFoundationServices();
  const maker = actor();
  seedRules(services, [
    { employeeId: ph03Ids.employee, basicPaise: 3100000 },
    { employeeId: ph03Ids.manager, basicPaise: 2000000 },
  ]);
  const run = runPeriodToLock(services, "2026-10");
  const prepared = services.compensationIntegration.prepareBankDisbursement(maker, run.id, {
    bankBatchRef: "PP-2026-10-0001",
    accountStatusByEmployee: { [ph03Ids.manager]: "FROZEN_ACCOUNT" },
  });
  // Write the suspense hold off WITHOUT re-disbursement: the money is now unaccounted and
  // the tie-out equation must catch it — that is the control working.
  services.compensationIntegration.writeOffHold(maker, prepared.holds[0].id, { reason: "erroneous write-off" });
  assert.throws(
    () => services.compensationIntegration.reconcileDisbursement(maker, run.id),
    (error) =>
      error instanceof FoundationError &&
      error.code === "ERR-G10-RECON-TIEOUT" &&
      String(error.details.validation) === "VAL-G10-TIEOUT" &&
      Number(error.details.residualPaise) === prepared.holds[0].heldAmountPaise
  );
});

test("PH-09D FR-09: G09 penalty recovery is bounded by the net-pay floor + CPC s.60 cap; barred residue books to deduction_carryforwards", async () => {
  const services = createFoundationServices();
  const maker = actor();
  seedRules(services, [{ employeeId: ph03Ids.employee, basicPaise: 3100000 }]);
  const run = runPeriodToLock(services, "2026-09");
  const [{ payslip }] = services.payrollEngine.listRunPayslips(maker, run.id);
  assert.equal(payslip.status, "PUBLISHED");
  const penaltyOrder = imposePenaltyOrder(services);

  // Fail closed until the bounds are configured — the statutory cap is seeded, never invented.
  assert.throws(
    () =>
      services.compensationIntegration.scheduleRecoveryFromPenaltyOrder(maker, {
        penaltyOrderId: penaltyOrder.id,
        period: "2026-10",
        orderedTotalPaise: 500000,
        requestedPerCyclePaise: 100000,
      }),
    (error) => error instanceof FoundationError && error.code === "PRECONDITION_FAILED"
  );
  services.compensationIntegration.configureRecoveryPolicy(maker, {
    netPayFloorBps: 5000,
    attachmentCapBps: 3300,
    attachmentExemptionBasis: "CPC s.60 attachment exemption (seeded fixture basis)",
  });

  // NEGATIVE: a per-cycle demand of the FULL net pay breaches both bounds -> BARRED, and
  // the residue is booked forward into deduction_carryforwards (E35), never silently taken.
  const before = services.payrollEngine.listCarryforwards(maker, ph03Ids.employee).length;
  assert.throws(
    () =>
      services.compensationIntegration.scheduleRecoveryFromPenaltyOrder(maker, {
        penaltyOrderId: penaltyOrder.id,
        period: "2026-10",
        orderedTotalPaise: payslip.netPayCents,
        requestedPerCyclePaise: payslip.netPayCents,
      }),
    (error) =>
      error instanceof FoundationError &&
      error.code === "ERR-G10-RECOVERY-BARRED" &&
      Number(error.details.attachmentCapPaise) > 0 &&
      Number(error.details.allowedPerCyclePaise) < payslip.netPayCents
  );
  const carryforwards = services.payrollEngine.listCarryforwards(maker, ph03Ids.employee);
  assert.equal(carryforwards.length, before + 1);
  const residue = carryforwards[carryforwards.length - 1];
  assert.equal(residue.sourceType, "DISCIPLINARY");
  assert.equal(residue.sourceRef, `g09_penalty_orders:${penaltyOrder.id}`);
  assert.ok(residue.outstandingCents > 0);

  // A bounded per-cycle demand schedules cleanly and ties back to the real G09 order.
  const schedule = services.compensationIntegration.scheduleRecoveryFromPenaltyOrder(maker, {
    penaltyOrderId: penaltyOrder.id,
    period: "2026-10",
    orderedTotalPaise: 500000,
    requestedPerCyclePaise: 100000,
  });
  assert.equal(schedule.penaltyOrderId, penaltyOrder.id);
  assert.equal(schedule.penaltyOrderNo, penaltyOrder.orderNo);
  assert.equal(schedule.scheduledPerCyclePaise, 100000);
  assert.ok(schedule.scheduledPerCyclePaise <= schedule.attachmentCapPaise);
  // A schedule against a non-existent order is refused — no silent stubs.
  assert.throws(
    () =>
      services.compensationIntegration.scheduleRecoveryFromPenaltyOrder(maker, {
        penaltyOrderId: "penalty-order-does-not-exist",
        period: "2026-10",
        orderedTotalPaise: 100000,
        requestedPerCyclePaise: 10000,
      }),
    (error) => error instanceof FoundationError && error.code === "NOT_FOUND"
  );
});

test("PH-09D FR-20: fnf_settlements consolidates open loans_advances + deduction_carryforwards with the AC2 net equation and FNF SoD", async () => {
  const services = createFoundationServices();
  const maker = actor();
  seedRules(services, [{ employeeId: ph03Ids.employee, basicPaise: 3100000 }]);
  const run = runPeriodToLock(services, "2026-09");
  const [{ payslip }] = services.payrollEngine.listRunPayslips(maker, run.id);
  const penaltyOrder = imposePenaltyOrder(services);
  services.compensationIntegration.configureRecoveryPolicy(maker, {
    netPayFloorBps: 5000,
    attachmentCapBps: 3300,
    attachmentExemptionBasis: "CPC s.60 attachment exemption (seeded fixture basis)",
  });
  // Produce an OPEN carryforward via a barred recovery (residue books forward).
  assert.throws(
    () =>
      services.compensationIntegration.scheduleRecoveryFromPenaltyOrder(maker, {
        penaltyOrderId: penaltyOrder.id,
        period: "2026-10",
        orderedTotalPaise: payslip.netPayCents,
        requestedPerCyclePaise: payslip.netPayCents,
      }),
    (error) => error instanceof FoundationError && error.code === "ERR-G10-RECOVERY-BARRED"
  );
  const openCarryforward = services.payrollEngine.listCarryforwards(maker, ph03Ids.employee).find((row) => row.status === "OPEN");
  assert.ok(openCarryforward);
  // E16 loans_advances: an ACTIVE loan with an outstanding balance to pull into the FnF.
  const loan = services.compensationIntegration.addLoanAdvance(maker, {
    employeeId: ph03Ids.employee,
    loanType: "HBA",
    sanctionedPrincipalPaise: 800000,
    outstandingPaise: 500000,
  });

  const settlement = services.compensationIntegration.settleFnf(maker, {
    employeeId: ph03Ids.employee,
    separationDate: "2026-12-31",
    finalMonthPayPaise: 4000000,
    leaveEncashmentPaise: 300000,
    gratuityPaise: 1000000,
    noticePayRecoveryPaise: 0,
    finalTdsPaise: 50000,
  });
  // AC4: the open loan and the open carryforward are pulled in — with their references.
  assert.equal(settlement.loanSettlementPaise, 500000);
  assert.equal(settlement.carryforwardRecoveryPaise, openCarryforward.outstandingCents);
  assert.deepEqual(settlement.loanRefs, [loan.id]);
  assert.deepEqual(settlement.carryforwardRefs, [openCarryforward.id]);
  // AC2 net equation over integer paise.
  assert.equal(
    settlement.netSettlementPaise,
    4000000 + 300000 + 1000000 - 0 - settlement.loanSettlementPaise - settlement.carryforwardRecoveryPaise - 50000
  );
  assert.equal(settlement.status, "COMPUTED");
  // The pulled dues close WITH the settlement (one transaction at the Pg seam).
  assert.equal(services.compensationIntegration.listLoans(maker, ph03Ids.employee)[0].status, "SETTLED_IN_FNF");
  const settledCarryforward = services.payrollEngine.listCarryforwards(maker, ph03Ids.employee).find((row) => row.id === openCarryforward.id);
  assert.equal(settledCarryforward.status, "RECOVERED");
  assert.equal(settledCarryforward.outstandingCents, 0);
  // AC1: a second consolidated settlement for the same employee is refused.
  assert.throws(
    () => services.compensationIntegration.settleFnf(maker, { employeeId: ph03Ids.employee, separationDate: "2026-12-31", finalMonthPayPaise: 1 }),
    (error) => error instanceof FoundationError && error.code === "CONFLICT"
  );
  // AC3 SoD: fnf_settlements.approved_by != created_by.
  assert.throws(
    () => services.compensationIntegration.approveFnfSettlement(maker, settlement.id),
    (error) => error instanceof FoundationError && error.code === "PRECONDITION_FAILED" && String(error.details.marker) === "FNF_SOD"
  );
  const approved = services.compensationIntegration.approveFnfSettlement(approver(), settlement.id);
  assert.equal(approved.status, "APPROVED");

  // AC4 negative net: dues exceeding the final pay leave the settlement RECOVERY_PENDING —
  // never a silent write-off.
  services.compensationIntegration.addLoanAdvance(maker, {
    employeeId: ph03Ids.manager,
    loanType: "PC_ADVANCE",
    sanctionedPrincipalPaise: 900000,
  });
  const negative = services.compensationIntegration.settleFnf(maker, {
    employeeId: ph03Ids.manager,
    separationDate: "2026-12-31",
    finalMonthPayPaise: 100000,
  });
  assert.equal(negative.netSettlementPaise, 100000 - 900000);
  assert.equal(negative.status, "RECOVERY_PENDING");
});

test("PH-09D FR-23: PAY_FIXATION / ANNUAL_INCREMENT post via the G12 ingest contract; a replayed fact_key is a SEMANTIC duplicate", async () => {
  const services = createFoundationServices();
  const maker = actor();
  const timelineBefore = services.serviceRegister.getTimeline(maker, ph03Ids.employee).length;

  const first = services.compensationIntegration.postPayEventToSr(maker, {
    employeeId: ph03Ids.employee,
    eventTypeCode: "PAY_FIXATION",
    eventDate: "2026-09-30",
    sourceReferenceId: "g10_payroll_runs:engine-run-000001:PAY_FIXATION",
    payload: { period: "2026-09" },
    idempotencyKey: "idem-ph09d-sr-001",
  });
  assert.equal(first.semanticDuplicate, false);
  assert.equal(first.event.sourceModule, "G10");
  assert.equal(first.event.eventTypeCode, "PAY_FIXATION");
  assert.equal(first.event.factKey, `G10:PAY_FIXATION:${ph03Ids.employee}:2026-09-30`);

  // Replay the SAME FACT from a different source row (a reopen successor re-posting): the
  // derived fact_key matches, so G12 dedups SEMANTICALLY — no second ledger row.
  const replay = services.compensationIntegration.postPayEventToSr(maker, {
    employeeId: ph03Ids.employee,
    eventTypeCode: "PAY_FIXATION",
    eventDate: "2026-09-30",
    sourceReferenceId: "g10_payroll_runs:engine-run-000002:PAY_FIXATION",
    payload: { period: "2026-09", replayedFrom: "engine-run-000001" },
    idempotencyKey: "idem-ph09d-sr-002",
  });
  assert.equal(replay.semanticDuplicate, true);
  assert.equal(replay.event.id, first.event.id);
  assert.equal(services.serviceRegister.getTimeline(maker, ph03Ids.employee).length, timelineBefore + 1);

  // A DIFFERENT fact (ANNUAL_INCREMENT) appends its own ledger event through the same relay.
  const increment = services.compensationIntegration.postPayEventToSr(maker, {
    employeeId: ph03Ids.employee,
    eventTypeCode: "ANNUAL_INCREMENT",
    eventDate: "2026-07-01",
    sourceReferenceId: "g10_payroll_runs:engine-run-000001:ANNUAL_INCREMENT",
    payload: { period: "2026-07" },
    idempotencyKey: "idem-ph09d-sr-003",
  });
  assert.equal(increment.semanticDuplicate, false);
  assert.equal(increment.event.eventTypeCode, "ANNUAL_INCREMENT");
  assert.equal(services.serviceRegister.getTimeline(maker, ph03Ids.employee).length, timelineBefore + 2);
});

test("PH-09D NEGATIVE G11 FR-14: disbursement without an ACTIVE PASSED account verification fails closed with ERR-G11-ACCOUNT-VERIFY", async () => {
  const services = createFoundationServices();
  const maker = actor();
  const sanctioner = actor({ userId: "user-ph09d-pension-sanctioner", actorUserId: "user-ph09d-pension-sanctioner" });

  // Bring a pension case to PPO_ISSUED (last-pay-drawn feed + verification + calc + sanction).
  services.payroll.createSalaryStructure(maker, {
    employeeId: ph03Ids.employee,
    basicPayCents: 10000000,
    daRateBps: 4200,
    hraRateBps: 800,
    npsRateBps: 1000,
    professionalTaxCents: 20000,
    ruleVersion: "PAY-RULE-2026-01",
    effectiveFrom: "2026-07-01",
  });
  const payRun = services.payroll.createRun(maker, { period: "2026-12" });
  services.payroll.lockInputs(maker, payRun.id);
  services.payroll.computeRun(maker, payRun.id);
  services.payroll.reconcileRun(maker, payRun.id);
  services.payroll.approveRun(approver(), payRun.id);
  services.payroll.lockRun(maker, payRun.id);
  services.payroll.disburseRun(maker, payRun.id);
  const pensionCase = services.pension.createCase(maker, { employeeId: ph03Ids.employee, separationDate: "2026-12-31", scheme: "OPS" });
  services.pension.verifyService(maker, pensionCase.id, { totalServiceMonths: 360, srCertified: true });
  services.pensionRules.addPensionLimitRule(maker, {
    ruleCode: "E35-PH09D",
    minPensionCents: 900000,
    maxPensionCents: 12500000,
    effectiveFrom: "2026-01-01",
  });
  services.pensionRules.addRoundingRule(maker, { ruleCode: "E36-PH09D", effectiveFrom: "2026-01-01" });
  services.pension.computeBenefits(maker, pensionCase.id, { ruleVersion: "PENSION-RULE-2026-01" });
  services.pension.sanction(sanctioner, pensionCase.id);
  services.pension.issuePpo(maker, pensionCase.id, { idempotencyKey: "idem-ph09d-ppo-001" });

  const account = { accountNoMasked: "XXXXXX1234", ifsc: "SBIN0000001" };
  // NEGATIVE: no pen_bank_account_verifications row for the account -> the first credit is
  // BLOCKED, fail closed (IR16).
  assert.throws(
    () => services.pensionDisbursement.disburse(maker, { caseId: pensionCase.id, lineType: "FIRST_PENSION", ...account, amountPaise: 900000 }),
    (error) => error instanceof FoundationError && error.code === "ERR-G11-ACCOUNT-VERIFY" && String(error.details.marker) === "IR16"
  );
  // NEGATIVE: a FAILED penny-drop never satisfies the gate.
  services.pensionDisbursement.recordAccountVerification(maker, {
    caseId: pensionCase.id,
    ...account,
    accountName: "A Sharma",
    method: "PENNY_DROP",
    nameMatchScoreBps: 6200,
    result: "FAILED",
  });
  assert.throws(
    () => services.pensionDisbursement.disburse(maker, { caseId: pensionCase.id, lineType: "FIRST_PENSION", ...account, amountPaise: 900000 }),
    (error) => error instanceof FoundationError && error.code === "ERR-G11-ACCOUNT-VERIFY"
  );

  // A PASSED verification (E42, ACTIVE) opens the gate; the credit carries the E42 ref.
  const verification = services.pensionDisbursement.recordAccountVerification(maker, {
    caseId: pensionCase.id,
    ...account,
    accountName: "A Sharma",
    method: "NAME_IFSC_MATCH",
    nameMatchScoreBps: 9800,
    verifiedName: "A Sharma",
    result: "PASSED",
  });
  assert.equal(verification.status, "ACTIVE");
  const disbursed = services.pensionDisbursement.disburse(maker, {
    caseId: pensionCase.id,
    lineType: "FIRST_PENSION",
    ...account,
    amountPaise: 900000,
  });
  assert.equal(disbursed.status, "TRANSMITTED");
  assert.equal(disbursed.accountVerificationRef, verification.id);
  // A different, unverified account remains blocked even after this one passed.
  assert.throws(
    () =>
      services.pensionDisbursement.disburse(maker, {
        caseId: pensionCase.id,
        lineType: "GRATUITY",
        accountNoMasked: "XXXXXX9999",
        ifsc: "HDFC0000002",
        amountPaise: 1000000,
      }),
    (error) => error instanceof FoundationError && error.code === "ERR-G11-ACCOUNT-VERIFY"
  );
});
