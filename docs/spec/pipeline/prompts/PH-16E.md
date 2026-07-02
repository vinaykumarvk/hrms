/goal
  objective: Build G07 credential verification + sponsorship service bonds, and G08 calibration/PIP/probation
    at BRD depth. The tranche-2 verdict (docs/spec/ph-15-verdict.md) and the coverage delta
    (docs/reviews/brd-coverage-delta-20260703.md) name G07 "credentials, sponsorship/bonds" and G08
    "calibration, PIP, probation confirmation" as still NOT_FOUND. Implement per FR-G07-018: external
    credentials with verification recorded in the append-only `credential_verifications` ledger
    (SUBMITTED -> EVIDENCE_REVIEWED -> VERIFIED/REJECTED); the self-capture creator can never be the verifier
    (SoD); a duplicate external reference for the same employee throws VAL-G07-CREDREF (409). Per FR-G07-020:
    `training_sponsorships` with sponsored amount, service-bond duration, and obligation_status
    (PROPOSED/SANCTIONED/ACTIVE/FULFILLED/BREACHED/RECOVERED/WAIVED); breach computes bond_recovery_amount
    and a BREACHED bond must emit a BOND_RECOVERY cost feeding G10 before it can move to RECOVERED
    (VAL-G07-BOND). Per FR-G08-09: calibration sessions produce `calibration_recommendations` (mandatory
    rationale + vote) — the committee NEVER writes final_grade; a certified grade changes only via a RATIFIED
    recommendation by the authority; applying an unratified recommendation throws ERR-G08-RATIFY (409);
    VAL-DISTRIB target distributions are diagnostic-only (no quota enforcement). Per FR-G08-13: the PIP
    lifecycle — `performance_improvement_plans` header with reason/dates/success criteria and >= 1
    `pip_milestones` row, activation gated on RvO concurrence, DRAFT -> ACTIVE -> CLOSED with a recorded
    outcome; a second overlapping active PIP is blocked. Per FR-G08-21: the PROBATION cycle outcome —
    `probation_confirmations` decision lifecycle yielding CONFIRMED/EXTENDED/DISCHARGE_RECOMMENDED; CONFIRMED
    records a confirmation date and feeds G01 (status/confirmation) and G12 (SR event); extension beyond
    probation_extension_max_months is blocked.
  context:
    - docs/spec/ph-15-verdict.md , docs/reviews/brd-coverage-delta-20260703.md   # G07/G08 backlog rows
    - docs/brd/v3/G07-training-skill-development.md    # FR-G07-018 (credential_verifications append-only,
                                                       #   VAL-G07-CREDREF 409, verifier != submitter SoD),
                                                       #   FR-G07-020 (training_sponsorships, BREACHED,
                                                       #   BOND_RECOVERY cost feed, VAL-G07-BOND)
    - docs/brd/v3/G08-performance-appraisal-management.md   # FR-G08-09 (calibration_recommendations,
                                                       #   ERR-G08-RATIFY 409, VAL-DISTRIB diagnostic-only),
                                                       #   FR-G08-13 (performance_improvement_plans,
                                                       #   pip_milestones, concurrence gate), FR-G08-21
                                                       #   (probation_confirmations, probation_outcome,
                                                       #   probation_extension_max_months cap)
    - docs/data-model/07-G07-training-skill-development.sql , docs/data-model/08-G08-performance-appraisal.sql
    - apps/api/src/modules/g07/** , apps/api/src/modules/g08/** and their routes   # PH-08D/PH-08E cores
    - apps/api/test/ph08e-g08-appraisal.test.cjs       # appraisal test conventions
  constraints:
    - credential_verifications is append-only (BRD rule 9): each verification step is a new row; the
      submitter-as-verifier SoD denial uses the platform-registered FORBIDDEN code (the BRD registers no
      G07-specific code for this SoD case — do not mint one); duplicate external reference throws
      error.code === 'VAL-G07-CREDREF' (409).
    - VAL-G07-BOND is fail-closed: obligation_status BREACHED -> RECOVERED is rejected unless a BOND_RECOVERY
      cost row (feeding G10) exists for the bond; breach computes bond_recovery_amount pro-rata in integer
      paise (no floats).
    - Calibration never mutates a certified grade directly: recommendations carry a mandatory rationale;
      applying an unratified recommendation throws error.code === 'ERR-G08-RATIFY' (409); the VAL-DISTRIB
      distribution view is diagnostic-only — no code path enforces a quota.
    - PIP activation requires RvO concurrence (a principal distinct from the initiating RO); a PIP requires
      >= 1 milestone; overlapping active PIPs for the same employee are rejected with the platform-registered
      CONFLICT code (the BRD names no G08-specific code here — say so, do not mint); closing requires an
      outcome.
    - Probation extension beyond probation_extension_max_months is rejected with the platform-registered
      CONFLICT code (per FR-G08-21 failure handling); CONFIRMED writes the confirmation feed to G01 and a G12
      SR event via the existing outbox conventions.
    - Parameterised queries only; transactions around multi-step writes; integer paise for all money; no
      console.log; no stack traces in responses; no hardcoded secrets.
    - Do NOT weaken any oracle under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
  work_loops:
    - name: G07 credentials + sponsorship bonds
      max_iterations: 6
      repeat_until: credential_verifications appends the SUBMITTED -> EVIDENCE_REVIEWED -> VERIFIED/REJECTED
        trail with verifier != submitter and VAL-G07-CREDREF dedup; training_sponsorships tracks the
        obligation lifecycle, computes bond_recovery_amount on breach, and blocks BREACHED -> RECOVERED
        without a BOND_RECOVERY cost (VAL-G07-BOND).
      steps: [credential ledger + SoD + dedup, sponsorship store, breach computation, VAL-G07-BOND gate]
    - name: G08 calibration + PIP + probation
      max_iterations: 8
      repeat_until: calibration_recommendations carry rationale and reach a ratified apply path (unratified
        apply throws ERR-G08-RATIFY; VAL-DISTRIB diagnostic only); performance_improvement_plans enforce
        milestones + concurrence + single-active and close with an outcome; probation_confirmations yield
        CONFIRMED/EXTENDED/DISCHARGE_RECOMMENDED with the extension cap and the G01/G12 feed.
      steps: [recommendation + ratification, diagnostic distribution, PIP lifecycle, probation decision + feeds]
    - name: Oracle tests + verify
      max_iterations: 4
      repeat_until: apps/api/test contains (a) NEGATIVE duplicate credential ref asserting
        error.code === 'VAL-G07-CREDREF', (b) a verifier!=submitter SoD denial test, (c) NEGATIVE
        BREACHED->RECOVERED without BOND_RECOVERY cost asserting error.code === 'VAL-G07-BOND', (d) NEGATIVE
        unratified grade apply asserting error.code === 'ERR-G08-RATIFY', (e) a PIP lifecycle test
        (milestones, concurrence, outcome on close), (f) a probation test (CONFIRMED feed + extension cap
        blocked); `npm run typecheck` + `npm test` pass; `bash docs/spec/pipeline/checks/ph-16e.sh` RED items
        all closed.
      steps: [write executed tests, run typecheck/test, run oracle, fix]
  evidence_required:
    - apps/api/src/modules/g07/** naming credential_verifications, VAL-G07-CREDREF, training_sponsorships,
      BREACHED, BOND_RECOVERY, VAL-G07-BOND; apps/api/src/modules/g08/** naming calibration_recommendations,
      ERR-G08-RATIFY, VAL-DISTRIB, performance_improvement_plans, pip_milestones, probation_confirmations
    - apps/api/test/*.test.cjs: lifecycle tests + the three fail-closed negatives above
    - `bash docs/spec/pipeline/checks/ph-16e.sh` GREEN (external oracle; not self-certified)
  escalate_when:
    - A bond pro-rata formula or extension-cap default has no grounded source in BRD/DDL/module config (do
      not invent policy numbers).
    - The existing PH-08E appraisal grade/finalisation machine conflicts with ratified calibration adjustments
      (surface the cross-phase conflict; do not silently rewrite locked transitions).
    - The G01 confirmation feed or G12 SR posting hook is missing — record the dependency; do not fake the feed.
