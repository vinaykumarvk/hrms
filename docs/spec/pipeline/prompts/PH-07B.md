/goal
  objective: PH-07B — harden the G04 leave-to-SR relay into the statutory integration the BRD specifies.
    The audit (docs/reviews/brd-coverage-audit-20260702.md) scored G04 at 8/62 CONFIRMED: the relay is an
    in-memory enqueue with maxAttempts=2 and immediate retry — no lineage, no sequencing, no payload
    signature, no scheduled backoff, no dead-letter entity, no reconciliation, no correction links.
  audit_gaps_closed:
    - Lineage + ordering: every outbox event carries leave_spell_lineage_id (stable across
      approve/amend/cancel of a spell) and a monotonic event_sequence within that lineage, with a
      uniqueness guarantee on (lineage, sequence).
    - Payload integrity: payload_signature computed with a real HMAC (node crypto createHmac, key from
      environment) at enqueue and verified before posting to G12; a mismatch raises ERR-G04-SIGNATURE-INVALID
      and the event is quarantined, not posted.
    - Retry discipline: exponential backoff sets available_at; the relay only picks events whose
      available_at has passed (no immediate hot-loop retry).
    - Dead letter as an entity: exhausted events land in sr_dead_letter (persisted), with replay/discard
      operating on that entity.
    - Reconciliation: a run compares the G03 leave ledger against G12 SR events and records
      reconciliation_finding rows with finding types including MISSING_SR (ledger debit without SR event)
      and ORPHAN_CORRECTION (correction without an original).
    - Correction lineage: sr_correction_link rows connect a correcting event to the original it corrects.
  context:
    - docs/brd/v3/G04-leave-sr-integration.md              # FR text; ERR-G04-* registry; finding types
    - docs/data-model/04-G04-leave-sr-integration.sql      # leave_event_outbox, sr_dead_letter, reconciliation_run/finding, sr_correction_link columns
    - apps/api/src/modules/g04/leaveSrRelayService.ts , apps/api/src/modules/g03/** , apps/api/src/modules/g12/serviceRegisterService.ts
    - apps/api/src/db/** , apps/api/db/migrations/**       # persistence substrate to extend
  constraints:
    - Error codes must be the BRD-registered ERR-G04-* codes; signature failures must never post to G12.
    - HMAC key comes from an environment variable (never hardcoded); never log payloads or keys.
    - Persist new entities via the repository/migration path; parameterised queries; outbox pick + post +
      status transition is transactional.
    - Preserve existing idempotent-ingest and DLQ replay/discard behavior (tests must stay green).
    - No production console.log; no stack traces or internal paths in API responses.
    - Do NOT weaken or edit any oracle under docs/spec/pipeline/checks/; do NOT touch docs/spec/pipeline/.state/ or approvals/.
  work_loops:
    - name: lineage + signature + backoff
      max_iterations: 6
      repeat_until: outbox events carry leave_spell_lineage_id + event_sequence with uniqueness enforced;
        payload_signature is createHmac-based and verified pre-post with ERR-G04-SIGNATURE-INVALID on
        tamper; failed posts schedule available_at with exponential backoff and the relay honours it.
      steps: [lineage propagation from g03, sequence allocation, hmac sign/verify, backoff scheduling]
    - name: dead letter + reconciliation + correction links
      max_iterations: 5
      repeat_until: exhausted events persist to sr_dead_letter; a reconciliation run over G03 ledger vs G12
        SR emits findings typed MISSING_SR / ORPHAN_CORRECTION; corrections write sr_correction_link rows.
      steps: [sr_dead_letter entity + replay path, reconciliation comparator, correction linking]
    - name: tests + verify
      max_iterations: 4
      repeat_until: apps/api/test contains behavior tests for tampered-payload rejection
        (ERR-G04-SIGNATURE-INVALID), backoff scheduling (available_at in the future after failure),
        lineage/sequence uniqueness, and a reconciliation test producing MISSING_SR and ORPHAN_CORRECTION
        findings; `npm run typecheck` + `npm test` green; `bash docs/spec/pipeline/checks/ph-07b.sh` GREEN.
      steps: [write negative + reconciliation tests, run suites, run oracle, fix]
  freedom:
    - Backoff curve parameters, reconciliation run scoping/batching, and the quarantine representation for
      signature failures are yours to design within the BRD's named entities and codes.
    - The HMAC key env var name is your choice; document it in the env notes.
  evidence_required:
    - apps/api/src/modules/g04/** diffs + migrations for sr_dead_letter / reconciliation / correction link
    - tests: signature-tamper negative, backoff, reconciliation findings
    - `npm run typecheck` + `npm test` green; ph-07b.sh GREEN
  escalate_when:
    - The G12 ingest contract cannot carry the correction-link reference without amendment.
    - Lineage cannot be derived for an existing G03 flow without changing its approved semantics.
