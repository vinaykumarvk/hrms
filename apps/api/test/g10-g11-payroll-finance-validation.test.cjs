const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, FoundationError, ph03Ids } = require("../../../dist/apps/api/src");

// Payroll/finance/pension role validation. Exercises the G10/G11 money-sensitive cluster against
// the real runtime. Tests are tagged ENFORCED (runtime matches auth-matrix intent) or DRIFT
// (runtime diverges). Per the agreed scope, the thin capability-flag gaps — PAYROLL_APPROVE,
// PAYROLL_DISBURSE, DDO_SANCTION — were closed with additive role checks; this suite proves both
// the new gates and the pre-existing SoD controls. The remaining role-string drift (e.g. pension
// sanction not requiring the pension_sanctioning_authority role) is documented, not built.

function actor(userId, roles, permissions) {
  return { tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, userId, actorUserId: userId, permissions, roles, fieldGrants: [] };
}
function sysActor() {
  return actor("pf-sys", ["system"], ["*"]);
}
function forbidden(error) {
  return error instanceof FoundationError && error.code === "FORBIDDEN";
}
function precondition(error) {
  return error instanceof FoundationError && error.code === "PRECONDITION_FAILED";
}

// Build a COMPUTED payroll-engine run (maker = sysActor) over the PH-03 employee, mirroring the
// seedTestPayrollLifecycle substrate so compute succeeds.
function computedRun(services) {
  const sys = sysActor();
  if (services.payRules.listComponents(sys).length === 0) {
    services.payRules.createPayComponent(sys, { componentCode: "BASIC", name: "Basic Pay", category: "EARNING", calcMethod: "FLAT" });
    services.payRules.createPayComponent(sys, { componentCode: "PT", name: "Professional Tax", category: "DEDUCTION", calcMethod: "SLAB" });
    services.payRules.createPayRule(sys, { componentCode: "BASIC", calcMethod: "FLAT", computationOrder: 1, effectiveFrom: "2026-01-01" });
    services.payRules.createPayRule(sys, { componentCode: "PT", calcMethod: "SLAB", computationOrder: 2, effectiveFrom: "2026-01-01" });
    services.payRules.addRateRow(sys, { tableType: "PT_SLAB", state: "KA", slabMinCents: 0, slabMaxCents: 1500000, flatAmountCents: 20000, effectiveFrom: "2026-01-01" });
    services.payRules.addRateRow(sys, { tableType: "PT_SLAB", state: "KA", slabMinCents: 1500001, flatAmountCents: 30000, effectiveFrom: "2026-01-01" });
  }
  services.payrollEngine.enrolEmployee(sys, { employeeId: ph03Ids.employee, stateOfPosting: "KA", componentAmountsCents: { BASIC: 5000000 }, effectiveFrom: "2026-01-01" });
  const run = services.payrollEngine.createEngineRun(sys, { period: "2026-07", runMode: "FINAL" });
  services.payrollEngine.snapshotRunInputs(sys, run.id);
  return services.payrollEngine.computeEngineRun(sys, run.id).run;
}

// ---- PAYROLL_APPROVE (newly enforced) + PAYROLL_SOD (pre-existing) -------------------------------

test("ENFORCED PAYROLL_APPROVE: a payroll_officer holding g10.payroll.approve cannot approve; only payroll_approver can", () => {
  const services = createFoundationServices();
  const run = computedRun(services);
  assert.equal(run.status, "COMPUTED");

  // Impostor: carries the approve permission but not the payroll_approver role/flag.
  const impostor = actor("pf-impostor-approver", ["payroll_officer"], ["g10.payroll.approve"]);
  assert.throws(() => services.payrollEngine.approveEngineRun(impostor, run.id), forbidden);

  // Real approver (distinct from the run maker) succeeds.
  const approver = actor("pf-approver", ["payroll_approver"], ["g10.payroll.approve"]);
  const approved = services.payrollEngine.approveEngineRun(approver, run.id);
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.approvedByUserId, "pf-approver");
});

test("ENFORCED PAYROLL_SOD: the run maker cannot approve their own run even with the payroll_approver role", () => {
  const services = createFoundationServices();
  const run = computedRun(services); // makerUserId === "pf-sys"
  const makerAsApprover = actor("pf-sys", ["payroll_approver"], ["g10.payroll.approve"]);
  assert.throws(() => services.payrollEngine.approveEngineRun(makerAsApprover, run.id), (error) => precondition(error) && error.details?.marker === "PAYROLL_SOD");
});

// ---- PAYROLL_DISBURSE (newly enforced) -----------------------------------------------------------

test("ENFORCED PAYROLL_DISBURSE: transmitting the bank file requires payroll_disburser, not the maker/approver role", () => {
  const services = createFoundationServices();
  const run = computedRun(services);
  services.payrollEngine.approveEngineRun(actor("pf-approver", ["payroll_approver"], ["g10.payroll.approve"]), run.id);
  const locked = services.payrollEngine.lockEngineRun(actor("pf-locker", ["payroll_approver"], ["g10.payroll.lock"]), run.id);
  assert.equal(locked.status, "LOCKED");

  // Impostor: payroll_officer with the disburse permission but not the payroll_disburser role.
  const impostor = actor("pf-impostor-disburser", ["payroll_officer"], ["g10.payroll.disburse"]);
  assert.throws(() => services.payrollEngine.markRunTransmitted(impostor, run.id), forbidden);

  // Real disburser (distinct third person — 3-way SoD) succeeds.
  const disburser = actor("pf-disburser", ["payroll_disburser"], ["g10.payroll.disburse"]);
  const transmitted = services.payrollEngine.markRunTransmitted(disburser, run.id);
  assert.ok(transmitted.transmittedAt);
});

// ---- DDO_SANCTION (newly enforced on loans) ------------------------------------------------------

test("ENFORCED DDO_SANCTION: sanctioning a loan/advance requires hod/sanctioning_authority; payroll_officer is FORBIDDEN", () => {
  const services = createFoundationServices();
  const loanInput = { employeeId: ph03Ids.employee, loanType: "CAR", principalPaise: 1000000, instalmentPaise: 10000 };

  const impostor = actor("pf-loan-impostor", ["payroll_officer"], ["g10.loan.sanction"]);
  assert.throws(() => services.loanPerquisiteGl.sanctionLoan(impostor, loanInput), forbidden);

  const ddo = actor("pf-ddo", ["hod"], ["g10.loan.sanction"]);
  const loan = services.loanPerquisiteGl.sanctionLoan(ddo, loanInput);
  assert.equal(loan.status, "ACTIVE");
  assert.equal(loan.principalPaise, 1000000);
});

// ---- FNF_SOD (pre-existing, 3-way: creator ≠ sanctioner, creator ≠ approver) --------------------

test("ENFORCED FNF_SOD: the settlement creator cannot sanction or approve; distinct roles can", () => {
  const services = createFoundationServices();
  const maker = actor("pf-fnf-maker", ["payroll_officer"], ["g10.fnf.settle"]);
  const settlement = services.compensationIntegration.settleFnf(maker, {
    employeeId: ph03Ids.employee,
    separationDate: "2026-12-31",
    finalMonthPayPaise: 2000000,
  });
  assert.equal(settlement.status, "COMPUTED");

  // Creator cannot sanction (even with the hod role).
  const makerAsHod = actor("pf-fnf-maker", ["hod"], ["g10.fnf.settle"]);
  assert.throws(() => services.compensationIntegration.sanctionFnfSettlement(makerAsHod, settlement.id), (error) => forbidden(error) && error.details?.marker === "FNF_SOD");

  // Creator cannot approve.
  const makerAsApprover = actor("pf-fnf-maker", ["payroll_approver"], ["g10.fnf.approve", "g10.fnf.settle"]);
  assert.throws(() => services.compensationIntegration.approveFnfSettlement(makerAsApprover, settlement.id), (error) => precondition(error) && error.details?.marker === "FNF_SOD");

  // Distinct DDO sanctions; distinct approver approves.
  const ddo = actor("pf-fnf-ddo", ["hod"], ["g10.fnf.settle"]);
  services.compensationIntegration.sanctionFnfSettlement(ddo, settlement.id);
  const approver = actor("pf-fnf-approver", ["payroll_approver"], ["g10.fnf.approve"]);
  const approved = services.compensationIntegration.approveFnfSettlement(approver, settlement.id);
  assert.equal(approved.status, "APPROVED");
});

// ---- PENSION_SOD (pre-existing) + role-string DRIFT (pension sanction is permission-only) --------

test("ENFORCED PENSION_SOD + DRIFT role-string: the maker cannot sanction, but a non-sanctioning-authority actor with the permission can", () => {
  // seedTestEmployees seeds Arjun's G10 last-drawn-pay + E35/E36 pension rules, so a case can reach
  // the computed (sanctionable) state without re-seeding substrate.
  const services = createFoundationServices({ seedTestEmployees: true });
  const arjun = services.employeeMaster.getByServiceNo(sysActor(), "GOV-100302").id;
  const sys = sysActor();
  const pensionCase = services.pension.createCase(sys, { employeeId: arjun, separationDate: "2026-07-01", scheme: "OPS" });
  services.pension.verifyService(sys, pensionCase.id, { totalServiceMonths: 360, srCertified: true });
  const computed = services.pension.computeBenefits(sys, pensionCase.id, { ruleVersion: "PENSION-RULE-2026-01" });
  assert.ok(computed.calculation, "computeBenefits must set the case calculation before sanction");

  // ENFORCED: the case maker (userId "pf-sys") cannot sanction, even with the sanctioning-authority role.
  const makerAsSanctioner = actor("pf-sys", ["pension_sanctioning_authority"], ["g11.pension.sanction"]);
  assert.throws(() => services.pension.sanction(makerAsSanctioner, pensionCase.id), (error) => precondition(error) && error.details?.marker === "PENSION_SOD");

  // DRIFT: a pension_officer (NOT the pension_sanctioning_authority role) holding g11.pension.sanction
  // and distinct from the maker CAN sanction — runtime checks the permission + SoD only, never the
  // pension_sanctioning_authority role string (auth-matrix.yaml g11.pension.sanction allowed_roles).
  const impostor = actor("pf-pension-impostor", ["pension_officer"], ["g11.pension.sanction"]);
  const sanctioned = services.pension.sanction(impostor, pensionCase.id);
  assert.equal(sanctioned.status, "SANCTIONED");
  assert.equal(sanctioned.sanctionedByUserId, "pf-pension-impostor");
});
