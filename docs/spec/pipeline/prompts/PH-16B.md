/goal
  objective: Build G02 bulk corrections, fraud/velocity risk signals, and employment-status gating at BRD
    depth. The tranche-2 verdict (docs/spec/ph-15-verdict.md) and the coverage delta
    (docs/reviews/brd-coverage-delta-20260703.md) name G02 "bulk corrections, fraud/velocity" as still
    NOT_FOUND. Implement per FR-G02-009: `bulk_correction_batches` — HR uploads a CSV-shaped row set, a
    dry-run validation checks existence/scope/sensitivity/employment-status-gate/one-open-change and produces
    a valid/invalid report, valid rows generate child change_requests, the batch routes for AGGREGATE P01
    approval, and approval commits valid rows individually and idempotently with per-row partial failures
    reported (batch status UPLOADED -> VALIDATED -> PENDING_APPROVAL -> APPROVED -> COMMITTED/PARTIAL_FAILED).
    Per FR-G02-019: a risk engine evaluates each submitted request and appends `cr_risk_signals` rows —
    implement at least the DUPLICATE_BANK_ACCOUNT (same new bank account across multiple employees) and
    AUTH_CHANNEL_THEN_FINANCIAL (auth-channel change followed by a financial change) detectors — aggregating
    risk_score (0-100) and risk_band (LOW/MEDIUM/HIGH/BLOCKED); BLOCKED holds commit pending review
    (412 ERR-G02-RISKBLOCK) until a fraud reviewer clears or confirms the signal. Per FR-G02-018: the request
    snapshots employment_status_at_submit; self-service on any non-ACTIVE target throws 403
    ERR-G02-STATUSGATE; bank/nominee changes on a DECEASED record route to the elevated family-pension
    controlled path (dual control — never auto-apply).
  context:
    - docs/spec/ph-15-verdict.md , docs/reviews/brd-coverage-delta-20260703.md   # G02 backlog rows
    - docs/brd/v3/G02-personal-details-modification-workflow.md   # FR-G02-009 (E12 bulk_correction_batches,
                                                       #   PARTIAL_FAILED), FR-G02-018 (ERR-G02-STATUSGATE 403,
                                                       #   employment_status_at_submit, DECEASED elevation),
                                                       #   FR-G02-019 (E13 cr_risk_signals append-only,
                                                       #   signal_type enum, risk_score/risk_band,
                                                       #   ERR-G02-RISKBLOCK 412)
    - docs/data-model/02-G02-personal-details-workflow.sql        # authoritative table/column names
    - apps/api/src/modules/g02/** , apps/api/src/routes/g02.routes.ts   # PH-07C change-request core to build on
    - apps/api/test/ph07c-g02-change-governance.test.cjs               # change-request test conventions
  constraints:
    - cr_risk_signals is an append-only ledger (BRD rule 9): INSERT only; each fired signal is one row with
      signal_type, severity, and score; reviewer clear/confirm mutates review status fields, never deletes.
    - Commit hold is fail-closed: risk_band=BLOCKED throws error.code === 'ERR-G02-RISKBLOCK' (412) on any
      commit attempt until a reviewer (a principal distinct from the requester) clears the signal; a confirmed
      signal keeps the request blocked.
    - Status gate is fail-closed: self-service on a non-ACTIVE employment_status_at_submit throws
      error.code === 'ERR-G02-STATUSGATE' (403); DECEASED bank/nominee changes require the elevated path with
      dual control (SoD — requester cannot approve); never auto-apply.
    - Bulk commit is per-row idempotent (replaying a committed row is a no-op); a failed row is recorded and
      the batch ends PARTIAL_FAILED, not wholesale rollback (BRD FR-G02-009 AC4).
    - Batch statuses follow the E12 enum verbatim: UPLOADED, VALIDATED, PENDING_APPROVAL, APPROVED, REJECTED,
      COMMITTED, PARTIAL_FAILED.
    - Parameterised queries only; transactions around multi-step writes; no console.log; no stack traces in
      responses; no hardcoded secrets.
    - Do NOT weaken any oracle under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
  work_loops:
    - name: Bulk correction batches
      max_iterations: 6
      repeat_until: apps/api/src/modules/g02/** stages a bulk batch, dry-run validates rows (report of
        valid/invalid), routes an aggregate approval, and commits per-row idempotently with failures recorded
        and PARTIAL_FAILED terminal status when any row fails.
      steps: [batch store + dry-run validate, child change_requests, aggregate approval, per-row idempotent commit]
    - name: Risk signals + status gate
      max_iterations: 8
      repeat_until: submission evaluates DUPLICATE_BANK_ACCOUNT and AUTH_CHANNEL_THEN_FINANCIAL detectors into
        append-only cr_risk_signals with risk_score/risk_band; BLOCKED holds commit (ERR-G02-RISKBLOCK) until
        reviewer clear/confirm; non-ACTIVE self-service throws ERR-G02-STATUSGATE; DECEASED bank/nominee routes
        to the elevated dual-control path.
      steps: [detectors + signal ledger, band aggregation + commit hold, reviewer clear/confirm, status gate + DECEASED elevation]
    - name: Oracle tests + verify
      max_iterations: 4
      repeat_until: apps/api/test contains (a) a bulk dry-run + per-row commit test ending PARTIAL_FAILED on a
        seeded failing row, (b) a DUPLICATE_BANK_ACCOUNT detector test, (c) an AUTH_CHANNEL_THEN_FINANCIAL
        detector test, (d) NEGATIVE blocked commit asserting error.code === 'ERR-G02-RISKBLOCK', (e) NEGATIVE
        non-ACTIVE self-service asserting error.code === 'ERR-G02-STATUSGATE', (f) a DECEASED elevation test;
        `npm run typecheck` + `npm test` pass; `bash docs/spec/pipeline/checks/ph-16b.sh` RED items all closed.
      steps: [write executed tests, run typecheck/test, run oracle, fix]
  evidence_required:
    - apps/api/src/modules/g02/** naming bulk_correction_batches, PARTIAL_FAILED, cr_risk_signals,
      DUPLICATE_BANK_ACCOUNT, AUTH_CHANNEL_THEN_FINANCIAL, ERR-G02-RISKBLOCK, ERR-G02-STATUSGATE,
      employment_status_at_submit
    - apps/api/test/*.test.cjs: detector + bulk tests + the two fail-closed negatives above
    - `bash docs/spec/pipeline/checks/ph-16b.sh` GREEN (external oracle; not self-certified)
  escalate_when:
    - A velocity threshold (N days of payroll cutoff/separation) has no grounded source in BRD/module config
      (do not invent policy numbers; ship the two named detectors and record the others as config-gapped).
    - The PH-07C change-request state machine conflicts with the injected commit hold (surface the
      cross-phase conflict; do not silently rewrite locked transitions).
    - The G01 employment_status read-through needed for the gate is missing a hook — record the dependency,
      do not stub the gate open.
