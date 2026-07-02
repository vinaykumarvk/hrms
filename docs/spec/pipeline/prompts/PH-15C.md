/goal
  objective: Build G03 shifts, rosters, punch ingestion, and comp-off at BRD depth. The coverage delta
    (docs/reviews/brd-coverage-delta-20260703.md) names "shifts/rosters, punch ingestion, comp-off" as still
    NOT_FOUND after the PH-06/PH-07 leave and attendance-derivation work. Implement per FR-01: shift definitions
    (timings, grace, date_anchor_rule) and roster assignment over date ranges where overlapping PUBLISHED rosters
    are rejected (VAL-G03-ROSTER-OVERLAP -> 409) and publishing supersedes the prior open-ended roster. Per FR-03:
    punch ingestion into the append-only attendance_punches ledger — known (device_id, source_ref) marked
    DUPLICATE and not re-stored; unknown/inactive device rejected DEVICE_NOT_AUTHORIZED (403); future-dated punch
    rejected INVALID_PUNCH_TIME (422); attendance_date derived from the shift's date_anchor_rule (night shifts
    anchor to shift start date). Per FR-09: the append-only comp_off_ledger as the sole comp-off balance — earn
    credits with expires_on, redemption consumes FIFO from non-expired credits, over-balance throws
    COMP_OFF_INSUFFICIENT (409), and an expiry sweep lapses unused credits (JOB-G03-COMPOFF-EXPIRE semantics).
  context:
    - docs/reviews/brd-coverage-delta-20260703.md      # G03 remaining: shifts/rosters, punch ingestion, comp-off
    - docs/brd/v3/G03-attendance-and-leave-management.md   # FR-01 (VAL-G03-ROSTER-OVERLAP, VAL-G03-SHIFT-TIMES),
                                                       #   FR-03 (dedup, DEVICE_NOT_AUTHORIZED, INVALID_PUNCH_TIME,
                                                       #   attendance_date via date_anchor_rule), FR-09
                                                       #   (COMP_OFF_INSUFFICIENT, COMP_OFF_EXPIRED, FIFO, expires_on);
                                                       #   E1 shifts, E2 rosters, E6 attendance_punches, E11 comp_off_ledger
    - docs/data-model/03-G03-attendance-leave.sql      # authoritative table/column names
    - apps/api/src/modules/g03/** , apps/api/src/routes/g03.routes.ts   # PH-06B leave + PH-07D attendance feed to build on
    - apps/api/test/ph06b-g03-leave-brd-depth.test.cjs , apps/api/test/ph07d-g03-payroll-feed.test.cjs
  constraints:
    - attendance_punches and comp_off_ledger are append-only ledgers: INSERT only; dedup returns the DUPLICATE
      status without a second row; comp-off balance is derived from the ledger (balance_after reconciles), never
      a mutable counter.
    - Roster overlap validation covers PUBLISHED rosters for the same employee over intersecting date ranges and
      throws error.code === 'VAL-G03-ROSTER-OVERLAP' (409); malformed shift timings throw VAL-G03-SHIFT-TIMES (422).
    - attendance_date derivation is shift-anchored via date_anchor_rule: a night-shift punch after midnight
      attributes to the shift start date — cover this in an executed test.
    - Device authentication is a real marker on ingestion: punches carry a device identity checked against
      registered devices; unregistered/inactive -> DEVICE_NOT_AUTHORIZED (403), fail closed.
    - Comp-off redemption is FIFO over non-expired credits ordered by earn date; expired credits are never
      consumed (COMP_OFF_EXPIRED where redemption targets an expired credit); over-balance throws
      error.code === 'COMP_OFF_INSUFFICIENT'.
    - Parameterised queries only; transactions around multi-step writes; no console.log; no stack traces in responses.
    - Do NOT weaken any oracle under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
  work_loops:
    - name: Shifts + rosters with overlap validation
      max_iterations: 6
      repeat_until: apps/api/src/modules/g03/** persists shifts (timings/grace/date_anchor_rule) and rosters over
        date ranges; overlapping PUBLISHED rosters throw VAL-G03-ROSTER-OVERLAP; publishing supersedes the prior
        open-ended roster from the new effective_from.
      steps: [shift store + VAL-G03-SHIFT-TIMES, roster assignment, overlap validator, supersede-on-publish]
    - name: Punch ingestion + comp-off ledger
      max_iterations: 8
      repeat_until: punch ingestion dedupes on (device_id, source_ref), enforces device auth and punch-time
        validity, derives attendance_date from the assigned shift's date_anchor_rule, and stores append-only;
        comp_off_ledger earns credits with expires_on, redeems FIFO from non-expired credits, throws
        COMP_OFF_INSUFFICIENT on over-balance, and expires unused credits via a sweep.
      steps: [ingest + dedup + device auth, attendance_date derivation, comp-off earn/redeem FIFO, expiry sweep]
    - name: Oracle tests + verify
      max_iterations: 4
      repeat_until: apps/api/test contains (a) NEGATIVE roster overlap asserting error.code === 'VAL-G03-ROSTER-OVERLAP',
        (b) a dedup test (second identical punch -> DUPLICATE, single row), (c) NEGATIVE unauthorised device
        asserting DEVICE_NOT_AUTHORIZED, (d) a night-shift attendance_date derivation test, (e) a FIFO redemption
        + expiry test, (f) NEGATIVE over-balance asserting error.code === 'COMP_OFF_INSUFFICIENT';
        `npm run typecheck` + `npm test` pass; `bash docs/spec/pipeline/checks/ph-15c.sh` RED items all closed.
      steps: [write executed tests, run typecheck/test, run oracle, fix]
  evidence_required:
    - apps/api/src/modules/g03/** naming shifts, rosters, attendance_punches, comp_off_ledger, date_anchor_rule,
      VAL-G03-ROSTER-OVERLAP, DEVICE_NOT_AUTHORIZED, COMP_OFF_INSUFFICIENT
    - apps/api/test/*.test.cjs: derivation + FIFO tests + the three fail-closed negatives above
    - `bash docs/spec/pipeline/checks/ph-15c.sh` GREEN (external oracle; not self-certified)
  escalate_when:
    - A date-anchor or expiry policy value has no grounded source in BRD/DDL/module config (do not invent policy numbers).
    - The existing PH-07D attendance derivation conflicts with shift-anchored attendance_date (surface the
      cross-phase conflict; do not silently rewrite the locked payroll feed).
    - Device registry storage (P04 substrate) is missing a needed hook — record the dependency, do not stub auth open.
