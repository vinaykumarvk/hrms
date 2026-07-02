/goal
  objective: Build G01 alias-based dedup/merge, PROVISIONAL bulk import, and profile lifecycle at BRD depth.
    The tranche-2 verdict (docs/spec/ph-15-verdict.md, "Remaining backlog") and the coverage delta
    (docs/reviews/brd-coverage-delta-20260703.md) name G01 "dedup/merge, bulk import, lifecycle
    separate/reactivate" as still NOT_FOUND. Implement per FR-EPM-015: deterministic + fuzzy matching queues
    `dedup_candidates` (exact statutory-ID match scores HIGH >= 90; fuzzy composite scored 0-100 with matched
    attributes); a 4-eyes merge consolidates ONLY G01 satellites under the survivor, soft-deletes the loser,
    writes one `employee_id_aliases(loser_id -> survivor_id)` row with a `merge_snapshot`, and emits
    RECORDS_MERGED{survivor_id, loser_id} — never re-pointing another module's FKs; undo within the
    configurable window (default 7 days) restores the snapshot and sets is_reversed. Per FR-EPM-017: bulk
    import batches (`employee_import_batches` + `import_staging_rows`) with validation_profile STRICT|MIGRATION;
    rows marked VALID/PROVISIONAL/ERROR; commit is idempotent and creates PROVISIONAL rows with
    record_state=PROVISIONAL, login disabled, remediation_state=QUEUED; promote-active re-validates under
    STRICT and flips record_state to ACTIVE (promote with gaps -> 409). Per FR-EPM-018: lifecycle
    :separate/:reactivate/:archive with status-transition guards (section 10.1 machine), maker != checker on
    separation approval, SEPARATION/DEATH/REACTIVATION outbox events, DECEASED handoff, and archive blocked
    under an ACTIVE legal hold.
  context:
    - docs/spec/ph-15-verdict.md , docs/reviews/brd-coverage-delta-20260703.md   # G01 backlog rows
    - docs/brd/v3/G01-employee-profile-management.md   # FR-EPM-015 (dedup_candidates, employee_id_aliases,
                                                       #   merge_snapshot, RECORDS_MERGED, MERGE_CONFLICT 409,
                                                       #   UNDO_EXPIRED 409, SOD_VIOLATION 403), FR-EPM-017
                                                       #   (E20a/E20b import batches + staging, PROVISIONAL,
                                                       #   remediation queue, promote-active), FR-EPM-018
                                                       #   (INVALID_STATE 409, LEGAL_HOLD_ACTIVE 409,
                                                       #   BLOCKING_OBLIGATIONS 409, record_state ARCHIVED)
    - docs/data-model/01-G01-employee-profile.sql      # authoritative table/column names (E19/E20/E21)
    - apps/api/src/modules/g01/** , apps/api/src/routes/g01.routes.ts   # PH-04B/PH-07A employee core to build on
    - apps/api/test/ph07a-g01-satellites-history-feed.test.cjs          # outbox/change-feed conventions
  constraints:
    - A merge NEVER writes to non-G01 tables: consolidate G01 satellites, soft-delete the loser, INSERT the
      alias row, emit RECORDS_MERGED via the existing outbox. Consumers resolve loser_id -> survivor_id through
      `employee_id_aliases` (chained aliases collapse to the ultimate survivor).
    - Merge is 4-eyes: maker = checker throws error.code === 'SOD_VIOLATION' (403); conflicting ACTIVE
      statutory states without override throw MERGE_CONFLICT (409); undo past the window throws
      UNDO_EXPIRED (409). All three are BRD-registered codes (FR-EPM-015 failure handling).
    - Import commit is idempotent (replay skips) and transactional per chunk; PROVISIONAL rows are excluded
      from active rollups, login-disabled, and queued (remediation_state=QUEUED); promote-active re-validates
      under STRICT — the BRD registers only the 409 status for promote-with-gaps (no named code), so use the
      closest registered code INVALID_STATE and say so in a code comment (never mint a new code).
    - Lifecycle transitions follow the BRD section-10.1 status machine: an invalid transition throws
      error.code === 'INVALID_STATE' (409); archive under an ACTIVE legal_holds row throws
      LEGAL_HOLD_ACTIVE (409); open blocking obligations without override throw BLOCKING_OBLIGATIONS (409);
      separation disables the linked login and emits SEPARATION (DEATH for DECEASED).
    - Parameterised queries only; transactions around multi-step writes; no console.log; no stack traces in
      responses; no hardcoded secrets.
    - Do NOT weaken any oracle under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
  work_loops:
    - name: Dedup candidates + alias merge + undo
      max_iterations: 8
      repeat_until: apps/api/src/modules/g01/** queues dedup_candidates with scores, merges with 4-eyes into
        employee_id_aliases + merge_snapshot + RECORDS_MERGED outbox event, resolves identity through the alias
        (chained collapse), and supports windowed undo; SOD_VIOLATION / MERGE_CONFLICT / UNDO_EXPIRED enforced.
      steps: [matcher + candidate queue, 4-eyes merge tx + alias + outbox, resolve endpoint, windowed undo]
    - name: Bulk import batches + PROVISIONAL glide path
      max_iterations: 6
      repeat_until: import batches stage rows, validate under STRICT/MIGRATION marking VALID/PROVISIONAL/ERROR,
        commit idempotently creating PROVISIONAL employees (login-disabled, remediation QUEUED), and
        promote-active re-validates under STRICT before flipping record_state to ACTIVE.
      steps: [batch + staging store, profile-scoped validation, idempotent commit, remediation queue + promote]
    - name: Lifecycle + oracle tests + verify
      max_iterations: 6
      repeat_until: :separate/:reactivate/:archive run with transition guards, maker!=checker separation
        approval, outbox events, and legal-hold archive block; a ph16a-*.test.cjs suite (the oracle scopes the
        shared-platform-code negatives to this phase's own test file) contains (a) NEGATIVE maker=checker
        merge asserting error.code === 'SOD_VIOLATION', (b) NEGATIVE undo past window asserting UNDO_EXPIRED,
        (c) NEGATIVE conflicting-state merge asserting MERGE_CONFLICT, (d) an alias-resolution test (merged
        loser id resolves to survivor), (e) a PROVISIONAL commit + promote-active test, (f) NEGATIVE invalid
        lifecycle transition asserting INVALID_STATE, (g) NEGATIVE archive under legal hold asserting
        LEGAL_HOLD_ACTIVE; `npm run typecheck` + `npm test` pass;
        `bash docs/spec/pipeline/checks/ph-16a.sh` RED items all closed.
      steps: [lifecycle service + guards, write executed tests, run typecheck/test, run oracle, fix]
  evidence_required:
    - apps/api/src/modules/g01/** naming dedup_candidates, employee_id_aliases, merge_snapshot, RECORDS_MERGED,
      employee_import_batches, import_staging_rows, PROVISIONAL, remediation_state, INVALID_STATE, LEGAL_HOLD_ACTIVE
    - apps/api/test/*.test.cjs: the alias/import/lifecycle tests + the four fail-closed negatives above
    - `bash docs/spec/pipeline/checks/ph-16a.sh` GREEN (external oracle; not self-certified)
  escalate_when:
    - A match-score threshold or undo-window value has no grounded source in BRD/DDL/module config (do not
      invent policy numbers beyond the BRD's stated HIGH >= 90 and 7-day default).
    - The existing PH-07A satellite/outbox contracts conflict with alias-merge consolidation (surface the
      cross-phase conflict; do not silently rewrite the locked change-feed).
    - Login-disable needs a user-provisioning hook the P04 substrate does not expose — record the dependency,
      do not stub auth open.
