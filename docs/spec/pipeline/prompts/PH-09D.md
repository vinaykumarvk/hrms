/goal
  objective: Close the compensation-wave integration, SoD, and provenance gaps the audit found. Implement: bank
    disbursement tie-out where SIGMA(disbursed) + SIGMA(held) + SIGMA(failed) = run net enforced before lock
    (ERR-G10-RECON-TIEOUT) with reconciliation sign-off SoD (ERR-G10-RECON-UNSIGNED); disbursement_holds as the
    suspense ledger for excluded/failed net pay; recovery scheduling from G09 penalty orders bounded by the net-pay
    floor and the CPC s.60 attachment cap (ERR-G10-RECOVERY-BARRED); FnF consolidated settlement (fnf_settlements)
    pulling open loans_advances and deduction_carryforwards; G10->G12 service-register postings (PAY_FIXATION,
    ANNUAL_INCREMENT) through the SR ingest contract with fact_key semantic dedup; and the pension pre-credit
    account verification gate (pen_bank_account_verifications) that blocks disbursement until verified
    (ERR-G11-ACCOUNT-VERIFY).
  context:
    - docs/reviews/brd-coverage-audit-20260702.md      # bank-file/GL, recovery, FnF, disbursement gaps
    - docs/brd/v3/G10-payroll-and-benefits.md          # E21 bank_disbursements, E22 payroll_reconciliations, E30 fnf_settlements,
                                                       #   E31 disbursement_holds, E35 deduction_carryforwards; VAL-G10-TIEOUT,
                                                       #   ERR-G10-RECON-TIEOUT, ERR-G10-RECON-UNSIGNED, ERR-G10-RECOVERY-BARRED; FR-G10-23 SR posting
    - docs/brd/v3/G11-retirement-and-pension.md        # E42 pen_bank_account_verifications; ERR-G11-ACCOUNT-VERIFY, ERR-G11-INVALID-ACCOUNT
    - docs/brd/v3/G12-digital-service-register.md      # ingest contract: source_module, source_reference_id, fact_key dedup
    - apps/api/src/modules/g10 , apps/api/src/modules/g11 , apps/api/src/modules/g09 , apps/api/src/modules/g12
    - apps/api/test/ph09-compensation-integration.test.cjs   # current integration slice tests to deepen
  constraints:
    - Tie-out is an equation over integer paise on real ledger rows: disbursed + held + failed must equal run net;
      any residual blocks lock with ERR-G10-RECON-TIEOUT. No tolerance windows.
    - SoD: the reconciliation signer must differ from the run computer/approver; unsigned or same-actor sign-off is
      rejected (ERR-G10-RECON-UNSIGNED). Enforce actor identity, not a boolean flag.
    - Recovery orders from G09 schedule against net pay bounded by BOTH the net-pay floor and the CPC s.60 cap;
      a barred recovery raises ERR-G10-RECOVERY-BARRED and books the residue to deduction_carryforwards.
    - FnF settlement consolidates final pay, open loans_advances balances, and deduction_carryforwards in one
      transactional settlement — partial writes must roll back.
    - SR postings go through the G12 ingest contract with source_module="G10" and a deterministic fact_key so
      replays dedup semantically; never write service_register_events directly from G10.
    - Pension disbursement requires an ACTIVE verification row in pen_bank_account_verifications (PENNY_DROP /
      NAME_IFSC_MATCH / NPCI_MAPPER); absent or failed verification blocks with ERR-G11-ACCOUNT-VERIFY. Fail closed.
    - Parameterised queries; transactions for multi-step writes; integer money math; no console.log; no stack traces.
    - Do NOT weaken any oracle under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
  work_loops:
    - name: Disbursement tie-out + holds + SoD
      max_iterations: 6
      repeat_until: bank_disbursements + disbursement_holds ledgers exist and the pre-lock reconciliation enforces the
        tie-out equation and distinct-signer SoD with the named error codes.
      steps: [disbursement + hold ledgers, tie-out equation gate, reconciliation sign-off SoD]
    - name: Recovery, FnF, SR provenance, pension gate
      max_iterations: 8
      repeat_until: G09-sourced recoveries respect floor + s.60 cap; fnf_settlements consolidates loans and
        carryforwards transactionally; PAY_FIXATION/ANNUAL_INCREMENT post to G12 via ingest with fact_key dedup;
        pension disbursement is blocked without account verification.
      steps: [recovery scheduler + caps, FnF settlement, SR ingest postings with fact_key, pre-credit verification gate]
    - name: Oracle tests + verify
      max_iterations: 4
      repeat_until: apps/api/test contains (a) a tie-out equation test incl. NEGATIVE ERR-G10-RECON-TIEOUT on an
        induced residual, (b) NEGATIVE SoD test asserting ERR-G10-RECON-UNSIGNED for same-actor sign-off,
        (c) NEGATIVE ERR-G10-RECOVERY-BARRED over-cap recovery test, (d) SR dedup test asserting a replayed
        PAY_FIXATION posting with the same fact_key is a semantic duplicate (no second ledger row), (e) NEGATIVE
        ERR-G11-ACCOUNT-VERIFY unverified-account disbursement test; `npm run typecheck` + `npm test` pass;
        `bash docs/spec/pipeline/checks/ph-09d.sh` GREEN.
      steps: [write executed tests, run typecheck/test, run oracle, fix]
  evidence_required:
    - apps/api/src/modules/g10/**, g11/** integration code naming the BRD entities/codes above
    - apps/api/test/*.test.cjs: tie-out, SoD, recovery-cap, SR-dedup, account-verification tests (with negatives)
    - `bash docs/spec/pipeline/checks/ph-09d.sh` GREEN (external oracle; not self-certified)
  escalate_when:
    - The CPC s.60 cap parameters are not grounded in BRD/seed data (do not invent the statutory fraction).
    - The G12 ingest contract cannot express a required posting without contract amendment — request the amendment.
    - A required G09 penalty-order linkage does not exist upstream (record the cross-module gap; no silent stubs).
