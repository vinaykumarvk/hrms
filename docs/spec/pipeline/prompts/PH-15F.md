/goal
  objective: Close two named statutory gaps in one wave. G09 (per the coverage delta
    docs/reviews/brd-coverage-delta-20260703.md: "POSH/ICC, personal hearings, SLA pause"): implement the
    FR-G09-023 POSH route — HARASSMENT cases resolve the ICC template, set inquiry_route=ICC_POSH, and ICC
    constitution enforces composition (presiding officer + at least one ICC_EXTERNAL_MEMBER); missing composition
    throws ERR-G09-ICC-PROCEDURE-REQUIRED. FR-G09-025 personal_hearings for SHOW_CAUSE/APPEAL stages — request
    recorded, authority grants or denies, denial without a denial_reason throws ERR-G09-PERSONAL-HEARING-DENIED
    (422). FR-G09-024 sla_pause_events — a pause records stage/reason/paused_from, no breach is raised while
    paused, resume sets resumed_at and recomputes sla_target_at/expected_closure_date by adding the paused
    duration; resume without an open pause throws ERR-G09-SLA-PAUSE-INVALID (409). G06 (delta: "rota-quota
    multi-stream"): implement FR-PPP-020 — seniority_quota_rules (DR/promotee/LDCE ratios, rotation_method,
    rotation_start_slot, unfilled carry-forward) drive deterministic multi-stream combined seniority construction;
    each entry records quota_slot_label and rotation_cycle_no and a rotation trace is retrievable; a population
    entry missing its stream tag fails with STREAM_TAG_MISSING and an invalid ratio/method with QUOTA_RULE_INVALID.
  context:
    - docs/reviews/brd-coverage-delta-20260703.md      # G09 remaining: POSH/ICC, personal hearings, SLA pause; G06: rota-quota
    - docs/brd/v3/G09-disciplinary-cases-punishment.md # FR-G09-023/024/025; E28 sla_pause_events, E29 personal_hearings;
                                                       #   inquiry_route ICC_POSH; ICC_PRESIDING/ICC_MEMBER/ICC_EXTERNAL_MEMBER;
                                                       #   ERR-G09-ICC-PROCEDURE-REQUIRED, ERR-G09-PERSONAL-HEARING-DENIED,
                                                       #   ERR-G09-SLA-PAUSE-INVALID
    - docs/brd/v3/G06-promotion-posting-progression.md # FR-PPP-020; seniority_quota_rules, quota_slot_label,
                                                       #   rotation_cycle_no, ROTA_QUOTA/RUNNING_ACCOUNT/SEPARATE_STREAM,
                                                       #   DR_FIRST/PROMOTEE_FIRST; STREAM_TAG_MISSING, QUOTA_RULE_INVALID
    - docs/data-model/09-G09-disciplinary-punishment.sql , docs/data-model/06-G06-promotion-posting-progression.sql
    - apps/api/src/modules/g09/** , apps/api/src/modules/g06/** and their routes   # PH-08C/PH-08E depth to build on
    - apps/api/test/ph08e-g09-due-process.test.cjs , apps/api/test/ph08c-g06-depth.test.cjs
  constraints:
    - ICC composition is validated at constitution time against the appointment roles: a POSH case without a
      presiding officer and at least one external member cannot proceed to inquiry — thrown as
      error.code === 'ERR-G09-ICC-PROCEDURE-REQUIRED', fail closed.
    - Personal-hearing denial requires a recorded denial_reason; deny-without-reason throws
      error.code === 'ERR-G09-PERSONAL-HEARING-DENIED'; grant records schedule/minutes and the referencing
      show-cause/appeal carries personal_hearing_id.
    - sla_pause_events are append-only: resume writes resumed_at on the open pause (never deletes); the paused
      duration is added to the stage targets on resume (recompute asserted numerically in a test); overlapping
      pauses coalesce for breach evaluation; pause/resume land on the hash-chained case timeline.
    - Rota-quota construction is deterministic: the same population + quota rule yields the same interleave,
      slot labels, and cycle numbers on recompute (deep-equal); unfilled slots carry forward, never silently lost.
    - STREAM_TAG_MISSING and QUOTA_RULE_INVALID are thrown as error.code values from the construction/rule paths.
    - Parameterised queries only; transactions around multi-step writes; no console.log; no stack traces in responses.
    - Do NOT weaken any oracle under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
  work_loops:
    - name: G09 ICC route + personal hearings
      max_iterations: 8
      repeat_until: apps/api/src/modules/g09/** routes HARASSMENT cases to ICC_POSH with composition validation
        (ERR-G09-ICC-PROCEDURE-REQUIRED on breach) and persists personal_hearings with grant/deny-with-reason
        (ERR-G09-PERSONAL-HEARING-DENIED on reasonless denial) linked to show-cause/appeal.
      steps: [ICC template resolution + inquiry_route, composition validator, personal_hearings store + decision gate]
    - name: G09 SLA pause + G06 rota-quota
      max_iterations: 8
      repeat_until: sla_pause_events pause/resume recomputes stage targets by the paused duration and rejects
        resume-without-pause (ERR-G09-SLA-PAUSE-INVALID); seniority_quota_rules drive deterministic multi-stream
        construction with quota_slot_label/rotation_cycle_no, carry-forward, and a rotation trace; STREAM_TAG_MISSING
        and QUOTA_RULE_INVALID guard the inputs.
      steps: [pause ledger + breach suppression, resume recompute, quota rules + construction engine, rotation trace]
    - name: Oracle tests + verify
      max_iterations: 4
      repeat_until: apps/api/test contains (a) NEGATIVE ICC constitution without external member asserting
        error.code === 'ERR-G09-ICC-PROCEDURE-REQUIRED', (b) NEGATIVE reasonless denial asserting
        error.code === 'ERR-G09-PERSONAL-HEARING-DENIED', (c) a pause/resume recompute test plus NEGATIVE
        resume-without-pause asserting error.code === 'ERR-G09-SLA-PAUSE-INVALID', (d) a deterministic rota-quota
        interleave test with carry-forward, (e) NEGATIVES asserting STREAM_TAG_MISSING and QUOTA_RULE_INVALID;
        `npm run typecheck` + `npm test` pass; `bash docs/spec/pipeline/checks/ph-15f.sh` RED items all closed.
      steps: [write executed tests, run typecheck/test, run oracle, fix]
  evidence_required:
    - apps/api/src/modules/g09/** naming ICC_POSH, personal_hearings, sla_pause_events and the three ERR codes;
      apps/api/src/modules/g06/** naming seniority_quota_rules, quota_slot_label, rotation_cycle_no,
      STREAM_TAG_MISSING, QUOTA_RULE_INVALID
    - apps/api/test/*.test.cjs: the five negatives above + recompute/determinism tests, all executed in the suite
    - `bash docs/spec/pipeline/checks/ph-15f.sh` GREEN (external oracle; not self-certified)
  escalate_when:
    - POSH composition/timeline parameters lack a grounded template source (do not invent statutory members/days).
    - The rota-quota worked vector (Appendix D.4) is not reproducible from the BRD tables (surface the ambiguity;
      do not tune the engine to a guessed vector).
    - SLA recompute interacts with an existing case-timeline invariant from PH-08E (surface the conflict; do not
      relax the hash-chain).
