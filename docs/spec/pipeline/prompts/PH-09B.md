/goal
  objective: Take the G10 payroll run engine to BRD depth. The audit shows an in-memory lifecycle slice with a flat
    computation: no DSL evaluation, no proration/LWP, no arrears, no statutory caps or PT, no YTD ledger, no payslip
    immutability, no in-flight guard, no net-pay floor. Implement: component DSL evaluation in declared computation
    order; proration + LWP driven by the G03 attendance/leave feed; an arrears engine (delta = SIGMA over affected
    months of new minus old, with month-wise breakup persisted); statutory deductions with caps and state-wise PT;
    YTD derived from the immutable payslip_lines ledger; payslips immutable after lock with reopen producing
    supersede versions (originals REVERSED, never edited); single-in-flight FINAL run guard; net-pay floor with
    excess recovery rolled into deduction_carryforwards.
  context:
    - docs/reviews/brd-coverage-audit-20260702.md      # G10: 97/111 line items NOT_FOUND; statutory core absent
    - docs/brd/v3/G10-payroll-and-benefits.md          # E11 payroll_runs, E12 payslips, E13 payslip_lines, E20 arrears,
                                                       #   E35 deduction_carryforwards; ERR-G10-RUN-INFLIGHT, ERR-G10-RUN-IMMUTABLE,
                                                       #   ERR-G10-REOPEN-BLOCKED, ERR-G10-RECOVERY-NET; VAL-G10-RULE-ORDER, VAL-G10-YTD-DERIVE
    - docs/data-model/10-G10-payroll-benefits.sql      # authoritative table/column names
    - apps/api/src/modules/g10/** (PH-09A rule substrate) , apps/api/src/modules/g03/**   # attendance/LWP source feed
    - apps/api/src/routes/g10.routes.ts , apps/api/test/ph09-g10-payroll.test.cjs         # current slice tests to deepen
  constraints:
    - All money in integer paise/cents; deterministic evaluation: same snapshot + same rule versions => byte-identical
      results on recompute. Rounding only via the ROUNDING_ADJUSTMENT component per the BRD.
    - Components evaluate in validated dependency order (VAL-G10-RULE-ORDER); circular references rejected.
    - LWP/proration facts come from the G03 feed consumed at snapshot time — do not hand-key attendance into G10.
    - Arrears persist the month-wise breakup rows (per month: old value, new value, delta), not just a total.
    - YTD figures derive from payslip_lines (VAL-G10-YTD-DERIVE); never from a mutable running counter.
    - Payslips: after run lock every mutation path throws ERR-G10-RUN-IMMUTABLE; reopen creates a superseding version
      and marks originals REVERSED; second concurrent FINAL run throws ERR-G10-RUN-INFLIGHT.
    - Net-pay floor: recovery beyond the protected floor throws/holds via ERR-G10-RECOVERY-NET and books the excess
      into deduction_carryforwards for the next cycle.
    - Parameterised queries only; transactions around multi-step writes; no console.log; no stack traces in responses.
    - Do NOT weaken any oracle under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
  work_loops:
    - name: Compute engine (DSL order, proration, LWP, caps, PT, YTD)
      max_iterations: 8
      repeat_until: apps/api/src/modules/g10/** computes a run by evaluating pay_rules in dependency order over the
        run snapshot, applies G03-fed LWP proration, applies statutory caps and state-wise PT slabs, and derives YTD
        from payslip_lines; recomputing the same locked snapshot yields identical payslip_lines.
      steps: [snapshot inputs incl. G03 feed, ordered DSL evaluation, proration/LWP, caps + PT, payslip_lines + YTD]
    - name: Arrears + guards + immutability
      max_iterations: 6
      repeat_until: arrears engine persists month-wise old/new/delta rows and books the total into the target run;
        ERR-G10-RUN-INFLIGHT raised on a second in-flight FINAL run; post-lock mutation raises ERR-G10-RUN-IMMUTABLE;
        reopen supersedes (REVERSED originals + new version); net-pay floor books deduction_carryforwards.
      steps: [arrears delta engine, in-flight guard, lock immutability + reopen versioning, net floor + carryforward]
    - name: Oracle tests + verify
      max_iterations: 4
      repeat_until: apps/api/test contains (a) a deterministic recompute test asserting deep-equal payslip output for
        the same locked snapshot, (b) NEGATIVE immutability test asserting ERR-G10-RUN-IMMUTABLE after lock,
        (c) NEGATIVE in-flight test asserting ERR-G10-RUN-INFLIGHT, (d) an arrears month-wise breakup test and an LWP
        proration test; `npm run typecheck` + `npm test` pass; `bash docs/spec/pipeline/checks/ph-09b.sh` GREEN.
      steps: [write executed tests, run typecheck/test, run oracle, fix]
  evidence_required:
    - apps/api/src/modules/g10/** engine code naming the BRD entities/codes above
    - apps/api/test/*.test.cjs: deterministic recompute + immutability/in-flight negative tests + arrears/LWP tests
    - `bash docs/spec/pipeline/checks/ph-09b.sh` GREEN (external oracle; not self-certified)
  escalate_when:
    - A statutory cap or PT slab value has no grounded source in BRD/DDL/seed data (do not invent statutory numbers).
    - Deterministic recompute is impossible because an input is not snapshot-frozen — surface it, do not fudge.
    - The G03 feed lacks a fact the BRD requires for proration (raise a cross-module gap instead of stubbing it silently).
