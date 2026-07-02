/goal
  objective: Build the G11 pensioner lifecycle and revisions engine at BRD depth. The coverage delta
    (docs/reviews/brd-coverage-delta-20260703.md) names "pensioner master/life certificates, revisions/DA relief
    runs" as still NOT_FOUND after PH-09 computed benefits and PPOs. Implement per FR-G11-12: a pen_pensioners
    master row created on PPO authorisation; annual life certificates (pen_life_certificates, LC/DLC) where an
    LC overdue beyond grace sets lifecycle SUSPENDED_NO_LC and holds disbursement, and submitting/verifying an LC
    reactivates the pensioner and releases held pension with arrear; death of a self-pensioner spawning
    family-pension conversion (E26 hierarchy, pen_family_pension_records) and a FAMILY_PENSION PPO with the
    pensioner moved to CONVERTED_TO_FAMILY. Per FR-G11-13: a revisions engine (pen_revisions) running DA-relief
    and pay-commission batches that recompute old vs new per pensioner with arrears from the effective date,
    require approval before APPLY, and are immutable once applied (corrections = new batch).
  context:
    - docs/reviews/brd-coverage-delta-20260703.md      # G11 remaining: pensioner master/life certs, revisions/DA relief
    - docs/brd/v3/G11-retirement-and-pension.md        # FR-G11-12 (lifecycle ACTIVE<->SUSPENDED_NO_LC->DECEASED->
                                                       #   CONVERTED_TO_FAMILY), FR-G11-13 (DA/pay-commission batches,
                                                       #   sect. 16.9 ordering in calc_trace); E14 pen_pensioners,
                                                       #   E15 pen_life_certificates, E16 pen_revisions, E10
                                                       #   pen_family_pension_records, E30 pen_da_relief_rates;
                                                       #   ERR-G11-LC-SUSPENDED, ERR-G11-REVISION-IMMUTABLE
    - docs/data-model/11-G11-retirement-pension.sql    # authoritative table/column names
    - apps/api/src/modules/g11/** , apps/api/src/routes/g11.routes.ts   # PH-09C benefit/PPO + disbursement code to build on
    - apps/api/test/ph09-g11-pension.test.cjs          # existing pension test conventions
  constraints:
    - Pensioner rows are created from PPO authorisation (pen_ppo_records), never hand-keyed detached from a PPO.
    - Disbursement to a pensioner in SUSPENDED_NO_LC throws error.code === 'ERR-G11-LC-SUSPENDED' (409, fail closed);
      LC submit/verify releases the hold and pays the held arrear.
    - Death conversion follows the pen_family_members (E26) hierarchy into pen_family_pension_records with
      enhanced_basis=AFTER_RETIREMENT and moves lifecycle to CONVERTED_TO_FAMILY in one transaction.
    - Revision determinism: the same batch inputs (rule rows, pensioner base, effective date) produce identical
      per-pensioner old/new/arrear deltas on recompute (deep-equal); the applied order is recorded in calc_trace.
    - Applied revision batches are immutable: any mutation of an applied batch throws
      error.code === 'ERR-G11-REVISION-IMMUTABLE'; corrections create a new batch.
    - All money in integer paise; no parseFloat/toFixed in pension math; DA relief rates come from
      pen_da_relief_rates effective-dated rows, never inline constants.
    - Parameterised queries only; transactions around multi-step writes; no console.log; no stack traces in responses.
    - Do NOT weaken any oracle under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
  work_loops:
    - name: Pensioner master + life-certificate lifecycle
      max_iterations: 8
      repeat_until: apps/api/src/modules/g11/** creates pen_pensioners on PPO authorisation, tracks
        pen_life_certificates with due/grace, suspends to SUSPENDED_NO_LC on lapse (disbursement throws
        ERR-G11-LC-SUSPENDED), and releases with arrear on LC submit/verify.
      steps: [pensioner enrolment from PPO, LC store + due/grace evaluation, suspend/hold, submit -> release + arrear]
    - name: Death conversion + revisions engine
      max_iterations: 8
      repeat_until: reported death converts to family pension (E26 hierarchy, FAMILY PPO, CONVERTED_TO_FAMILY)
        transactionally; pen_revisions batches compute deterministic old/new/arrear deltas for DA-relief and
        pay-commission runs, gate APPLY behind approval, and reject post-apply mutation with ERR-G11-REVISION-IMMUTABLE.
      steps: [death -> conversion + FAMILY PPO, DA-relief batch, pay-commission re-fix + arrears, apply immutability]
    - name: Oracle tests + verify
      max_iterations: 4
      repeat_until: apps/api/test contains (a) an enrolment-on-PPO test, (b) an LC lapse -> suspend -> submit ->
        release-with-arrear lifecycle test, (c) NEGATIVE disbursement while SUSPENDED_NO_LC asserting
        error.code === 'ERR-G11-LC-SUSPENDED', (d) a death -> CONVERTED_TO_FAMILY conversion test, (e) a revision
        determinism test asserting deep-equal deltas on recompute, (f) NEGATIVE mutation of an applied batch
        asserting error.code === 'ERR-G11-REVISION-IMMUTABLE'; `npm run typecheck` + `npm test` pass;
        `bash docs/spec/pipeline/checks/ph-15b.sh` RED items all closed.
      steps: [write executed tests, run typecheck/test, run oracle, fix]
  evidence_required:
    - apps/api/src/modules/g11/** naming pen_pensioners, pen_life_certificates, pen_revisions,
      pen_family_pension_records, SUSPENDED_NO_LC, CONVERTED_TO_FAMILY and the ERR codes above
    - apps/api/test/*.test.cjs: lifecycle + conversion + determinism tests + both fail-closed negatives
    - `bash docs/spec/pipeline/checks/ph-15b.sh` GREEN (external oracle; not self-certified)
  escalate_when:
    - A DA-relief or family-pension rate has no grounded source in BRD/DDL/seed data (do not invent statutory numbers).
    - The PH-09 PPO/disbursement substrate lacks a hook the lifecycle needs (surface the gap; do not fork a
      parallel disbursement path).
    - Determinism is impossible because a batch input is not snapshot to the batch (surface it, do not fudge).
