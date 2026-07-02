/goal
  objective: Build G10 loans/perquisites/GL/bank-file depth and G11 treasury-PDA/grievances/audit-objections
    at BRD depth. The tranche-2 verdict (docs/spec/ph-15-verdict.md) names G10 "loans/advances lifecycle,
    perquisites valuation, GL posting, bank-file positive-pay depth" and G11 "treasury/PDA interfaces,
    pensioner grievances" as still open. Implement per FR-G10-08: `loans_advances` instalment recovery over
    `loan_repayments` — each run recovers the scheduled instalment, the final instalment closes the loan with
    the closure invariant (sum of recovered principal = sanctioned principal; ledger never negative),
    foreclosure computes outstanding + accrued interest in one entry, and insufficient net throws
    ERR-G10-RECOVERY-NET (409) with the shortfall rolled into `deduction_carryforwards`. Per FR-G10-21: an
    is_concessional loan auto-produces an ACTIVE `perquisites` row valued per Rule 3 (reducing balance x
    (reference rate - charged rate)) feeding the tax pipeline; a missing reference rate throws
    ERR-G10-PERQ-REFRATE (422). Per FR-G10-19: `gl_journals` per run with the balance invariant
    total_debit = total_credit (an unbalanced journal is blocked, never exported) and posting lifecycle
    tracked through POSTED/ACKNOWLEDGED. Per FR-G10-14: on ambiguous/timeout ack the bank batch moves to
    SUSPECTED_PROCESSED and resend is forbidden until a positive-pay/treasury-debit confirmation records
    non-debit; a confirmed resend issues a NEW bank_batch_ref; failed lines park in `disbursement_holds`.
    Per FR-G11-21: the `pen_disbursing_authorities` registry with pda_disbursement_model
    (M11_COMPUTES_FULL | PDA_APPLIES_RELIEF); a PDA cannot go ACTIVE until sandbox_certified=true. Per
    FR-G11-16: `pen_grievances` intake with category/priority, SLA due dates, escalation on breach, and
    closure requiring resolution text (VAL-COMMENT). Per FR-G11-23: `pen_audit_objections` with source,
    calc_trace_ref linkage, SLA response routing, and outcome-driven closure
    (ACCEPTED_CORRECTED/DROPPED/RECOVERY_RAISED) through RAISED -> UNDER_RESPONSE -> RESPONDED -> CLOSED.
  context:
    - docs/spec/ph-15-verdict.md , docs/reviews/brd-coverage-delta-20260703.md   # G10/G11 backlog rows
    - docs/brd/v3/G10-payroll-and-benefits.md          # FR-G10-08 (ERR-G10-RECOVERY-NET, closure invariant),
                                                       #   FR-G10-14 (SUSPECTED_PROCESSED, positive-pay,
                                                       #   disbursement_holds, bank_batch_ref), FR-G10-19
                                                       #   (gl_journals, POSTED/ACKNOWLEDGED, balance),
                                                       #   FR-G10-21 (perquisites Rule 3, ERR-G10-PERQ-REFRATE)
    - docs/brd/v3/G11-retirement-and-pension.md        # FR-G11-16 (pen_grievances, SLA, VAL-COMMENT),
                                                       #   FR-G11-21 (pen_disbursing_authorities,
                                                       #   pda_disbursement_model, sandbox_certified),
                                                       #   FR-G11-23 (pen_audit_objections, calc_trace_ref)
    - docs/data-model/10-G10-payroll-benefits.sql , docs/data-model/11-G11-retirement-pension.sql
    - apps/api/src/modules/g10/** (PH-09A engine, PH-09D FnF loan pulls, PH-15A tax), apps/api/src/modules/g11/**
    - apps/api/test/ph09d-compensation-integration.test.cjs , apps/api/test/ph15b-g11-pensioner-lifecycle.test.cjs
  constraints:
    - All money is integer paise (PH-09A float ban stands). The loan ledger never goes negative: a recovery
      exceeding the outstanding balance is rejected — the BRD registers no specific over-recovery code
      (FR-G10-08 names only "ledger never negative"), so use the closest registered platform code CONFLICT
      (409) and say so in a code comment (never mint). Insufficient net uses the registered
      error.code === 'ERR-G10-RECOVERY-NET' with a deduction_carryforwards row.
    - Closure invariant is asserted, not assumed: on final instalment the sum of recovered principal equals
      the sanctioned principal and the loan closes; foreclosure settles outstanding + accrued interest in a
      single entry and stops future recovery (and stops the concessional perquisite going forward).
    - gl_journals must balance: total_debit != total_credit is rejected before export — the BRD registers no
      specific imbalance code (FR-G10-19 says "GL imbalance -> block"), so use the registered platform
      VALIDATION_FAILED (422) and say so in a code comment; posting status advances EXPORTED -> POSTED ->
      ACKNOWLEDGED only, never skipping.
    - Positive-pay is fail-closed: a SUSPECTED_PROCESSED batch rejects any resend until a non-debit
      confirmation by a principal distinct from the transmitter; the resend carries a NEW bank_batch_ref
      (never reuse); build on the existing PH-09 disbursement tie-out, do not fork it.
    - PDA activation is gated: status ACTIVE requires sandbox_certified=true — the BRD registers no specific
      code (FR-G11-21 AC2), so use the registered platform PRECONDITION_FAILED (412) and say so in a code
      comment. Grievance closure without resolution text throws the registered validation id VAL-COMMENT.
    - Parameterised queries only; transactions around multi-step writes; no console.log; no stack traces in
      responses; no hardcoded secrets.
    - Do NOT weaken any oracle under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
  work_loops:
    - name: G10 loans + perquisites
      max_iterations: 8
      repeat_until: loan_repayments recover instalments run-by-run with the closure invariant, foreclosure,
        over-recovery rejection, and ERR-G10-RECOVERY-NET carryforward; is_concessional loans auto-produce a
        Rule-3 perquisites row feeding tax, with ERR-G10-PERQ-REFRATE on a missing reference rate.
      steps: [amortised recovery, closure + foreclosure, insufficient-net carryforward, concessional perquisite]
    - name: G10 GL + positive-pay, G11 PDA/grievances/objections
      max_iterations: 8
      repeat_until: gl_journals build balanced (imbalance blocked) and track POSTED/ACKNOWLEDGED;
        SUSPECTED_PROCESSED blocks resend until confirmed non-debit then re-issues a new bank_batch_ref;
        pen_disbursing_authorities gate ACTIVE on sandbox_certified and branch on pda_disbursement_model;
        pen_grievances run intake -> SLA -> escalate -> resolve (VAL-COMMENT on close);
        pen_audit_objections route with calc_trace_ref and close by outcome.
      steps: [balanced GL + lifecycle, positive-pay hold + resend, PDA registry + gate, grievances + objections]
    - name: Oracle tests + verify
      max_iterations: 4
      repeat_until: a ph16f-*.test.cjs suite (the oracle scopes the loan insufficient-net negative to this
        phase's own test file because PH-09 already asserts the code elsewhere) contains (a) a
        closure-invariant + foreclosure test, (b) NEGATIVE over-recovery rejected (ledger never negative),
        (c) NEGATIVE loan insufficient net asserting
        error.code === 'ERR-G10-RECOVERY-NET' with a carryforward row, (d) a concessional Rule-3 perquisite
        test, (e) NEGATIVE unbalanced journal rejected (total_debit != total_credit), (f) a
        SUSPECTED_PROCESSED resend-block + new-batch-ref test, (g) a PDA sandbox gate test, (h) NEGATIVE
        grievance close without resolution asserting VAL-COMMENT, (i) an audit-objection outcome test;
        `npm run typecheck` + `npm test` pass; `bash docs/spec/pipeline/checks/ph-16f.sh` RED items all closed.
      steps: [write executed tests, run typecheck/test, run oracle, fix]
  evidence_required:
    - apps/api/src/modules/g10/** naming loan_repayments, foreclosure, ERR-G10-RECOVERY-NET,
      ERR-G10-PERQ-REFRATE, gl_journals, total_debit/total_credit, POSTED/ACKNOWLEDGED, SUSPECTED_PROCESSED;
      apps/api/src/modules/g11/** naming pen_disbursing_authorities, pda_disbursement_model,
      sandbox_certified, pen_grievances, pen_audit_objections, calc_trace_ref
    - apps/api/test/*.test.cjs: the invariant tests + the four fail-closed negatives above
    - `bash docs/spec/pipeline/checks/ph-16f.sh` GREEN (external oracle; not self-certified)
  escalate_when:
    - An interest method, reference rate, or SLA matrix value has no grounded source in BRD/DDL/module config
      (do not invent policy numbers).
    - The PH-09 locked payroll/disbursement tie-out conflicts with the new recovery or hold flows (surface
      the cross-phase conflict; do not silently rewrite the locked engine).
    - The PH-15A tax pipeline lacks the perquisite_total intake needed for Rule-3 wiring — record the
      dependency; do not fork a second tax path.
