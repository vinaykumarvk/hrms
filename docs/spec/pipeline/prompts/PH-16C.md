/goal
  objective: Build G04 versioned mapping catalog, relay partition leases with a stuck-in-flight reaper, and
    the pre-pension completeness certificate at BRD depth. The tranche-2 verdict (docs/spec/ph-15-verdict.md)
    and the coverage delta (docs/reviews/brd-coverage-delta-20260703.md) name G04 "mapping catalog, partition
    leases/reaper, pre-pension certificate" as still NOT_FOUND. Implement per FR-G04-02: the `sr_event_mapping`
    catalog — per (leave_type_code, event_type) a disposition POST_SR/EXCLUDED_NON_SR, target sr_entry_type,
    qualifying_service_rule, and a MANDATORY statutory_rule_ref for every POST_SR mapping (VAL-G04-CITATION);
    versions are immutable once PUBLISHED (status DRAFT/PUBLISHED/RETIRED; changes create a new version); no
    two PUBLISHED mappings for the same (leave_type_code, event_type) may overlap effective ranges — publish
    rejects with ERR-G04-MAPPING-OVERLAP (409); relay processing resolves the mapping ONCE at first claim and
    persists `pinned_mapping_version`, never recomputing across retries. Per FR-G04-15: `relay_partition_lease`
    per-partition in-order claims carrying claimed_at/lease_expires_at, and a JOB-G04-REAPER sweep that returns
    expired IN_FLIGHT rows to retry-eligible, increments attempt_count, and never strands a row beyond
    lease_timeout. Per FR-G04-18: `prepension_certificate` asserting open_high_critical_findings = 0 and
    provisional_entries_remaining = 0 for a PASS, with lineage_complete, total_non_qualifying_days, a SHA-256
    checksum over the evidence bundle, and a signer — a FAIL certificate lists blocking counts; the artefact
    is append-only and is G11's gate input.
  context:
    - docs/spec/ph-15-verdict.md , docs/reviews/brd-coverage-delta-20260703.md   # G04 backlog rows
    - docs/brd/v3/G04-leave-sr-integration.md          # FR-G04-02 (E9 sr_event_mapping, DRAFT/PUBLISHED/RETIRED,
                                                       #   ERR-G04-MAPPING-OVERLAP 409, VAL-G04-CITATION,
                                                       #   statutory_rule_ref), FR-G04-15 (E18
                                                       #   relay_partition_lease, JOB-G04-REAPER, attempt_count),
                                                       #   FR-G04-18 (E21 prepension_certificate fields,
                                                       #   PASS/FAIL, checksum, consumed_by_g11_at)
    - docs/data-model/04-G04-leave-sr-integration.sql  # authoritative table/column names
    - apps/api/src/modules/g04/** , apps/api/src/routes/g04.routes.ts   # PH-07B statutory relay to build on
    - apps/api/test/ph07b-g04-statutory-relay.test.cjs                  # relay/outbox test conventions
  constraints:
    - Mapping versions are immutable once PUBLISHED: an edit creates a new version; publish validates overlap
      across PUBLISHED versions of the same (leave_type_code, event_type) and throws
      error.code === 'ERR-G04-MAPPING-OVERLAP' (409) on intersecting effective ranges.
    - VAL-G04-CITATION is fail-closed: a POST_SR mapping without statutory_rule_ref is rejected (422) with the
      registered validation id VAL-G04-CITATION surfaced as the error code.
    - pinned_mapping_version is resolved once at first claim and persisted (BRD rule 3); retries reuse the
      pinned version — cover this in an executed test.
    - The reaper only recovers rows whose lease_expires_at has passed: a live lease is never reaped; a reaped
      row returns to retry-eligible with attempt_count incremented (fail-closed: expired IN_FLIGHT never
      silently lost, live IN_FLIGHT never double-claimed).
    - prepension_certificate is append-only (BRD rule 4): PASS requires zero open HIGH/CRITICAL findings AND
      zero provisional entries remaining; anything else is a FAIL certificate naming the blocking counts; the
      checksum is a real SHA-256 over the certified evidence, not a constant.
    - Parameterised queries only; transactions around multi-step writes; no console.log; no stack traces in
      responses; no hardcoded secrets.
    - Do NOT weaken any oracle under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
  work_loops:
    - name: Mapping catalog with versions + overlap rejection
      max_iterations: 6
      repeat_until: apps/api/src/modules/g04/** persists sr_event_mapping versions (DRAFT/PUBLISHED/RETIRED),
        rejects overlapping PUBLISHED ranges with ERR-G04-MAPPING-OVERLAP, enforces VAL-G04-CITATION for
        POST_SR, and pins pinned_mapping_version at first claim.
      steps: [catalog store + versioning, publish overlap validator, citation guard, pin-at-first-claim]
    - name: Partition leases + reaper + certificate
      max_iterations: 8
      repeat_until: relay_partition_lease claims are per-partition in-order with lease_expires_at; the
        JOB-G04-REAPER sweep returns only expired IN_FLIGHT rows to retry-eligible with attempt_count
        incremented; prepension_certificate issues PASS only at zero-open-HIGH/CRITICAL and zero provisional
        remaining, checksummed and signed, append-only.
      steps: [lease claim/renew, reaper sweep, certificate assembly + checksum, FAIL path with blocking counts]
    - name: Oracle tests + verify
      max_iterations: 4
      repeat_until: apps/api/test contains (a) NEGATIVE overlapping publish asserting
        error.code === 'ERR-G04-MAPPING-OVERLAP', (b) NEGATIVE POST_SR without citation asserting
        VAL-G04-CITATION, (c) a pinned-version retry test (pinned_mapping_version unchanged across retry),
        (d) a reaper test (expired lease reaped + attempt_count incremented; live lease untouched), (e) a
        certificate test (PASS at zero open findings; FAIL when a HIGH/CRITICAL finding or provisional entry
        remains); `npm run typecheck` + `npm test` pass; `bash docs/spec/pipeline/checks/ph-16c.sh` RED items
        all closed.
      steps: [write executed tests, run typecheck/test, run oracle, fix]
  evidence_required:
    - apps/api/src/modules/g04/** naming sr_event_mapping, ERR-G04-MAPPING-OVERLAP, VAL-G04-CITATION,
      statutory_rule_ref, pinned_mapping_version, relay_partition_lease, JOB-G04-REAPER, prepension_certificate
    - apps/api/test/*.test.cjs: pin/reaper/certificate tests + the two fail-closed negatives above
    - `bash docs/spec/pipeline/checks/ph-16c.sh` GREEN (external oracle; not self-certified)
  escalate_when:
    - A lease_timeout or straddle policy value has no grounded source in BRD/DDL/module config (do not invent
      policy numbers).
    - The existing PH-07B relay lineage/sequence contract conflicts with per-partition leasing (surface the
      cross-phase conflict; do not silently rewrite the locked relay semantics).
    - The reconciliation-findings source the certificate must assert over does not exist yet — ground the
      assertion on the existing G04 reconciliation data or record the dependency; do not fake a zero count.
