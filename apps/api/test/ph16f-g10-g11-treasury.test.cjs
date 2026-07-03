// PH-16F — G10 loans/perquisites/GL/bank-file + G11 PDA/grievances/objections at BRD depth.
//   G10 FR-08: loan_repayments instalment ledger with the closure invariant (outstanding never
//     negative) and foreclosure; a recovery with zero net headroom fails ERR-G10-RECOVERY-NET
//     and the shortfall carries to deduction_carryforwards.
//   G10 FR-21: a concessional (is_concessional) Rule-3 perquisite is valued against a reference
//     rate; without one it fails ERR-G10-PERQ-REFRATE.
//   G10 FR-19: gl_journals carry total_debit/total_credit and are rejected unless balanced;
//     lifecycle POSTED -> ACKNOWLEDGED.
//   G10 FR-14: a bank line's positive-pay confirmation; an ambiguous ack marks it
//     SUSPECTED_PROCESSED (disbursement_holds) and blocks a resend.
//   G11 FR-21: pen_disbursing_authorities carry pda_disbursement_model (PDA_APPLIES_RELIEF);
//     go-live is gated on sandbox_certified.
//   G11 FR-16: pen_grievances track sla_due_at; closing with no resolution fails VAL-COMMENT.
//   G11 FR-23: pen_audit_objections link calc_trace_ref; outcome ACCEPTED_CORRECTED.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const OFFICER = "user-ph16f-officer";

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: OFFICER,
    actorUserId: OFFICER,
    permissions: ["*"],
    roles: ["payroll_officer"],
    fieldGrants: ["*"],
    correlationId: "corr-ph16f",
    ...extra,
  };
}

// ── G10 loans_advances / loan_repayments ───────────────────────────────────────

test("G10 loan_repayments: instalment recovery honours the closure invariant and foreclosure settles the rest", () => {
  const s = createFoundationServices();
  const loan = s.loanPerquisiteGl.sanctionLoan(actor(), {
    employeeId: ph03Ids.employee,
    loanType: "HBA",
    principalPaise: 10_000_00,
    instalmentPaise: 4_000_00,
  });
  const r1 = s.loanPerquisiteGl.recordLoanInstalment(actor(), loan.id, { netAvailablePaise: 9_000_00, recordedAt: "2026-07-31" });
  assert.equal(r1.recoveredPaise, 4_000_00);
  assert.equal(r1.outstandingAfterPaise, 6_000_00);
  // Foreclosure settles the remaining 6,00,000 paise in one loan_repayments row.
  const fc = s.loanPerquisiteGl.forecloseLoan(actor(), loan.id, { recordedAt: "2026-08-15" });
  assert.equal(fc.kind, "FORECLOSURE");
  assert.equal(fc.outstandingAfterPaise, 0);
  const ledger = s.loanPerquisiteGl.listLoanRepayments(actor(), loan.id);
  assert.equal(ledger.length, 2);
});

test("G10 ERR-G10-RECOVERY-NET: zero net headroom fails closed and the shortfall carries forward", () => {
  const s = createFoundationServices();
  const loan = s.loanPerquisiteGl.sanctionLoan(actor(), {
    employeeId: ph03Ids.employee,
    loanType: "PC_ADVANCE",
    principalPaise: 5_000_00,
    instalmentPaise: 2_000_00,
  });
  assert.throws(
    () => s.loanPerquisiteGl.recordLoanInstalment(actor(), loan.id, { netAvailablePaise: 0, recordedAt: "2026-07-31" }),
    (err) => err.code === "ERR-G10-RECOVERY-NET"
  );
  // The unrecovered instalment is booked to deduction_carryforwards, never dropped.
  const cf = s.loanPerquisiteGl.listCarryforwards(actor(), ph03Ids.employee);
  assert.equal(cf.length, 1);
  assert.equal(cf[0].amountPaise, 2_000_00);
});

// ── G10 perquisites (Rule-3, is_concessional) ──────────────────────────────────

test("G10 perquisites: a concessional Rule-3 benefit values against a reference rate; missing one fails ERR-G10-PERQ-REFRATE", () => {
  const s = createFoundationServices();
  const perq = s.loanPerquisiteGl.valuePerquisite(actor(), {
    employeeId: ph03Ids.employee,
    perquisiteType: "CONCESSIONAL_LOAN",
    isConcessional: true,
    baseAmountPaise: 10_00_000,
    referenceRateBps: 900, // 9.00% SBI reference
    employeeRateBps: 400, // 4.00% concessional
  });
  // taxable = base * (900-400)/10000 = 10,00,000 * 500 / 10000 = 50,000 paise.
  assert.equal(perq.taxableValuePaise, 50_000);
  assert.equal(perq.isConcessional, true);
  assert.throws(
    () => s.loanPerquisiteGl.valuePerquisite(actor(), {
      employeeId: ph03Ids.employee,
      perquisiteType: "CONCESSIONAL_LOAN",
      isConcessional: true,
      baseAmountPaise: 10_00_000,
      employeeRateBps: 400,
    }),
    (err) => err.code === "ERR-G10-PERQ-REFRATE"
  );
});

// ── G10 gl_journals (balanced, POSTED -> ACKNOWLEDGED) ─────────────────────────

test("G10 gl_journals: an unbalanced journal is rejected; a balanced one posts and is acknowledged", () => {
  const s = createFoundationServices();
  assert.throws(
    () => s.loanPerquisiteGl.postGlJournal(actor(), {
      reference: "PAYROLL-2026-07",
      lines: [
        { account: "SALARY_EXP", debitPaise: 10_000_00, creditPaise: 0 },
        { account: "BANK", debitPaise: 0, creditPaise: 9_000_00 },
      ],
    }),
    (err) => err.code === "VALIDATION_FAILED"
  );
  const journal = s.loanPerquisiteGl.postGlJournal(actor(), {
    reference: "PAYROLL-2026-07",
    lines: [
      { account: "SALARY_EXP", debitPaise: 10_000_00, creditPaise: 0 },
      { account: "BANK", debitPaise: 0, creditPaise: 10_000_00 },
    ],
  });
  assert.equal(journal.totalDebitPaise, journal.totalCreditPaise);
  assert.equal(journal.status, "POSTED");
  const ack = s.loanPerquisiteGl.acknowledgeGlJournal(actor(), journal.id, { acknowledgedRef: "GL-ACK-771" });
  assert.equal(ack.status, "ACKNOWLEDGED");
});

// ── G10 bank-file positive-pay (SUSPECTED_PROCESSED) ───────────────────────────

test("G10 positive-pay: an ambiguous acknowledgement marks the line SUSPECTED_PROCESSED and blocks a resend", () => {
  const s = createFoundationServices();
  const line = s.loanPerquisiteGl.prepareBankLine(actor(), {
    employeeId: ph03Ids.employee,
    amountPaise: 45_000_00,
    accountRef: "acct-xxxx-4321",
    positivePayToken: "PPAY-TOK-9",
  });
  const held = s.loanPerquisiteGl.confirmPositivePay(actor(), line.id, { presentedToken: "PPAY-TOK-9", ambiguousAck: true });
  assert.equal(held.status, "SUSPECTED_PROCESSED");
  // A resend against a suspected-processed line is blocked (no double pay).
  assert.throws(
    () => s.loanPerquisiteGl.confirmPositivePay(actor(), line.id, { presentedToken: "PPAY-TOK-9" }),
    (err) => err.code === "PRECONDITION_FAILED"
  );
});

// ── G11 pen_disbursing_authorities (sandbox_certified gate) ─────────────────────

test("G11 PDA: go-live is gated on sandbox_certified; an uncertified PDA cannot be activated", () => {
  const s = createFoundationServices();
  const pda = s.pensionTreasury.registerPda(actor(), {
    pdaCode: "TREASURY-DL",
    name: "Delhi Treasury",
    pdaDisbursementModel: "PDA_APPLIES_RELIEF",
  });
  assert.equal(pda.sandboxCertified, false);
  assert.throws(
    () => s.pensionTreasury.activatePda(actor(), pda.id),
    (err) => err.code === "PRECONDITION_FAILED"
  );
  s.pensionTreasury.certifyPdaSandbox(actor(), pda.id);
  const active = s.pensionTreasury.activatePda(actor(), pda.id);
  assert.equal(active.status, "ACTIVE");
  assert.equal(active.pdaDisbursementModel, "PDA_APPLIES_RELIEF");
});

// ── G11 pen_grievances (sla_due_at, VAL-COMMENT) ───────────────────────────────

test("G11 pen_grievances: intake sets sla_due_at; closing without a resolution fails VAL-COMMENT", () => {
  const s = createFoundationServices();
  const grievance = s.pensionTreasury.raiseGrievance(actor(), {
    pensionerId: ph03Ids.employee,
    category: "NON_PAYMENT of monthly pension",
    description: "Pension not credited for July.",
    receivedOn: "2026-07-05",
  });
  // NON_PAYMENT -> 7-day SLA from receipt.
  assert.equal(grievance.slaDueAt, "2026-07-12");
  assert.throws(
    () => s.pensionTreasury.closeGrievance(actor(), grievance.id, { resolutionComment: "  " }),
    (err) => err.code === "VALIDATION_FAILED"
  );
  const closed = s.pensionTreasury.closeGrievance(actor(), grievance.id, { resolutionComment: "Credited with arrears on 2026-07-10." });
  assert.equal(closed.status, "CLOSED");
});

// ── G11 pen_audit_objections (calc_trace_ref, ACCEPTED_CORRECTED) ──────────────

test("G11 pen_audit_objections: an objection links calc_trace_ref and resolves ACCEPTED_CORRECTED", () => {
  const s = createFoundationServices();
  const objection = s.pensionTreasury.raiseAuditObjection(actor(), {
    caseId: "pen-case-ph16f",
    calcTraceRef: "calc-trace-9f2",
    ground: "Qualifying service undercounted by 6 months.",
  });
  assert.equal(objection.status, "RAISED");
  assert.equal(objection.calcTraceRef, "calc-trace-9f2");
  const resolved = s.pensionTreasury.resolveAuditObjection(actor(), objection.id, {
    outcome: "ACCEPTED_CORRECTED",
    responseNote: "Recomputed; correction pension revision raised.",
  });
  assert.equal(resolved.status, "ACCEPTED_CORRECTED");
});
