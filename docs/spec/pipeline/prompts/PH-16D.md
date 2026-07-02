/goal
  objective: Build G05 vacancy lifecycle, transfer counselling, and mutual-transfer pairing at BRD depth. The
    tranche-2 verdict (docs/spec/ph-15-verdict.md) and the coverage delta
    (docs/reviews/brd-coverage-delta-20260703.md) name G05 "counselling, vacancy lifecycle, mutual transfer"
    as still NOT_FOUND. Implement per FR-G05-003 and BRD rule 6: `vacancy_positions` published with a
    strength READ-THROUGH from the PH-08A sanctioned-posts kernel (G05 is never authoritative for strength),
    `transfer_preferences` capturing ranked choices, and `vacancy_reservations` carrying the lifecycle
    RESERVED -> VACATED_ON_RELIEF -> FILLED_ON_JOIN; allotment requires vacant_count > 0 with a transactional
    re-check — double-fill throws ERR-G05-VACANCY-FULL (409). Per FR-G05-019: an interactive counselling turn
    engine — `counselling_sessions` with a turn order (SENIORITY/MERIT, ties broken by service_no) and
    `current_turn_employee_id` holding the vacancy lock; only the current-turn candidate may choose
    (ERR-G05-COUNSEL-TURN, 409); every choice (CHOSEN/PASSED/DECLINED/AUTO_PASS_TIMEOUT/ABSENT) is an
    immutable append-only `counselling_choices` row; a CHOSEN vacancy converts to a RESERVED reservation; a
    turn times out to AUTO_PASS_TIMEOUT per turn_timeout_seconds (JOB-G05-COUNSEL-TIMEOUT semantics). Per BRD
    rule 5: a MUTUAL request requires a reciprocal request (mutual_counterpart_employee_id); both orders are
    approved/published atomically as a coupled pair posting the frozen G12 catalog SR code MUTUAL_TRANSFER;
    asymmetric completion throws ERR-G05-MUTUAL-PAIR (409).
  context:
    - docs/spec/ph-15-verdict.md , docs/reviews/brd-coverage-delta-20260703.md   # G05 backlog rows
    - docs/brd/v3/G05-transfer-relieving-joining-workflow.md   # FR-G05-003 (vacancy_positions,
                                                       #   transfer_preferences, vacancy_reservations),
                                                       #   FR-G05-019 (counselling_sessions/choices,
                                                       #   ERR-G05-COUNSEL-TURN 409, AUTO_PASS_TIMEOUT),
                                                       #   rules 5/6 (ERR-G05-MUTUAL-PAIR 409,
                                                       #   ERR-G05-VACANCY-FULL 409, MUTUAL_TRANSFER SR code)
    - docs/data-model/05-G05-transfer-relieving-joining.sql    # authoritative table/column names
    - apps/api/src/modules/g05/** , apps/api/src/routes/g05.routes.ts   # PH-06C/PH-08B transfer core to build on
    - apps/api/src/modules/g06/** (sanctioned posts kernel from PH-08A)  # strength read-through source
    - apps/api/test/ph08b-g05-administration.test.cjs                    # transfer test conventions
  constraints:
    - Strength is a read-through: vacancy_positions derives vacant_count from the PH-08A sanctioned-posts
      kernel; G05 never mutates a local strength counter as truth (BRD 5.2.7). Allotment re-checks
      vacant_count transactionally at reservation time; over-allotment throws
      error.code === 'ERR-G05-VACANCY-FULL' (409), fail closed.
    - counselling_choices is an append-only ledger: INSERT only, never UPDATE/DELETE; each row carries the
      choice, timestamp, turn_position, and recording officer; one live turn at a time — a choice by anyone
      other than current_turn_employee_id throws error.code === 'ERR-G05-COUNSEL-TURN' (409).
    - Turn timeout records AUTO_PASS_TIMEOUT and advances the turn (JOB-G05-COUNSEL-TIMEOUT semantics —
      injectable clock acceptable; do not busy-wait in tests).
    - Mutual coupling is atomic: pairing validates the reciprocal request; publish/approve applies to both
      coupled orders in one transaction; the SR posting uses the frozen catalog code MUTUAL_TRANSFER verbatim;
      asymmetric progression throws error.code === 'ERR-G05-MUTUAL-PAIR' (409).
    - Parameterised queries only; transactions around multi-step writes; no console.log; no stack traces in
      responses; no hardcoded secrets.
    - Do NOT weaken any oracle under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
  work_loops:
    - name: Vacancy lifecycle + preferences with strength read-through
      max_iterations: 6
      repeat_until: apps/api/src/modules/g05/** publishes vacancy_positions from the sanctioned-posts
        read-through, captures ranked transfer_preferences, and manages vacancy_reservations
        RESERVED -> VACATED_ON_RELIEF -> FILLED_ON_JOIN with a transactional vacant_count re-check throwing
        ERR-G05-VACANCY-FULL on over-allotment.
      steps: [read-through publish, preferences store, reservation lifecycle, transactional over-allotment guard]
    - name: Counselling turn engine + mutual pairing
      max_iterations: 8
      repeat_until: counselling_sessions run an ordered turn queue with current_turn_employee_id vacancy lock,
        append-only counselling_choices, out-of-turn rejection, timeout auto-pass, and CHOSEN -> RESERVED
        conversion; MUTUAL requests pair reciprocally, publish coupled orders atomically with the
        MUTUAL_TRANSFER SR code, and reject asymmetric completion.
      steps: [session + turn order, choice ledger + turn guard, timeout auto-pass, mutual pairing + coupled publish]
    - name: Oracle tests + verify
      max_iterations: 4
      repeat_until: apps/api/test contains (a) NEGATIVE out-of-turn choice asserting
        error.code === 'ERR-G05-COUNSEL-TURN', (b) NEGATIVE over-allotment asserting
        error.code === 'ERR-G05-VACANCY-FULL', (c) an append-only choice-ledger test (CHOSEN converts to a
        RESERVED reservation), (d) a timeout AUTO_PASS_TIMEOUT test, (e) a mutual-pair test (coupled orders,
        MUTUAL_TRANSFER code; NEGATIVE asymmetric completion asserting ERR-G05-MUTUAL-PAIR);
        `npm run typecheck` + `npm test` pass; `bash docs/spec/pipeline/checks/ph-16d.sh` RED items all closed.
      steps: [write executed tests, run typecheck/test, run oracle, fix]
  evidence_required:
    - apps/api/src/modules/g05/** naming vacancy_positions, vacancy_reservations, transfer_preferences,
      counselling_sessions, counselling_choices, current_turn_employee_id, ERR-G05-COUNSEL-TURN,
      ERR-G05-VACANCY-FULL, ERR-G05-MUTUAL-PAIR, MUTUAL_TRANSFER
    - apps/api/test/*.test.cjs: turn/timeout/mutual tests + the three fail-closed negatives above
    - `bash docs/spec/pipeline/checks/ph-16d.sh` GREEN (external oracle; not self-certified)
  escalate_when:
    - A turn-timeout default or tie-break rule has no grounded source in BRD/DDL/module config beyond the
      BRD's service_no tie-break (do not invent policy numbers).
    - The PH-08A sanctioned-posts kernel does not expose the read-through needed for vacant_count — record
      the dependency; do not duplicate strength as a G05-owned counter.
    - The frozen G12 SR catalog rejects MUTUAL_TRANSFER (surface the catalog conflict; do not mint a variant
      event code).
