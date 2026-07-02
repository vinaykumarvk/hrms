/goal
  objective: Build the G12/G13 INTEGRITY SUBSTRATE the audit proved fake. Today the "hash chain" is pseudoHash64
    (a toy string hash) and G13 "versioning" mutates a single record in place. Implement: real SHA-256 hashing via
    node crypto exposed as an exported sha256Hex(input) helper (exported from the apps/api/src index barrel so the
    oracle can probe it against a known vector) and used for the G12 entry hash chain; a trusted-time recorded_at
    field stamped server-side on every ledger append; the hash-chained sr_status_events sub-ledger (status changes
    are chained appends, never field updates); and G13 append-only document_versions rows with checkout_locks —
    checkIn appends a new version row, prior version rows are immutable, and a checked-out document rejects
    conflicting writes (ERR-G13-DOCUMENT_LOCKED).
  context:
    - docs/reviews/brd-coverage-audit-20260702.md      # "pseudo-hash chain"; "checkIn mutates one record"
    - apps/api/src/platform/types.ts                   # pseudoHash64 lives here — retire it from g12/g13 paths
    - apps/api/src/modules/g12/serviceRegisterService.ts   # current chain built on pseudoHash64 (lines 67,120)
    - apps/api/src/modules/g13/documentVaultService.ts     # current in-place checkIn to replace with version rows
    - docs/brd/v3/G12-digital-service-register.md      # E19 sr_status_events, recorded_at trusted time, entry_hash/prev chain
    - docs/brd/v3/G13-document-management-secure-storage.md   # document_versions, checkout_locks, ERR-G13-DOCUMENT_LOCKED
    - docs/data-model/12-G12-digital-service-register.sql , docs/data-model/13-G13-document-management.sql
    - apps/api/src/index.ts (barrel re-exported to dist consumed by apps/api/test/*.test.cjs)
  constraints:
    - sha256Hex must be require("crypto").createHash("sha256") over the exact input bytes, hex-encoded; export it
      from the apps/api/src index so dist exposes it. sha256Hex("abc") must equal
      ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad — the oracle executes this vector.
    - Remove every pseudoHash64 usage from apps/api/src/modules/g12 and g13; recompute chains with SHA-256 over a
      canonical serialization. The genesis previous-hash convention stays explicit.
    - recorded_at is assigned by the service clock at append time and is part of the hashed content; callers cannot
      supply or overwrite it.
    - sr_status_events: each status transition appends a row carrying prev status-hash and its own hash; exposing a
      mutator that edits status in place is a defect. The main event row's status may only be a projection of the
      sub-ledger.
    - G13: version rows are append-only — no update or delete path for an existing version row may exist; checkIn
      under another actor's active checkout lock throws ERR-G13-DOCUMENT_LOCKED; lock release is explicit.
    - Executed tests must include the SHA-256 known-vector test and a NEGATIVE append-only test proving an attempted
      update/delete of an existing version row (or in-place status edit) is rejected.
    - Parameterised queries; transactions for multi-step writes; no console.log; no stack traces in responses.
    - Do NOT weaken any oracle under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
  work_loops:
    - name: Real SHA-256 + G12 chain + recorded_at
      max_iterations: 6
      repeat_until: sha256Hex exists, is exported through the index barrel, passes the abc vector; g12 chain and
        idempotency hashing use it exclusively; recorded_at is server-stamped and hashed; pseudoHash64 no longer
        appears in apps/api/src/modules/g12.
      steps: [sha256Hex helper + export, swap g12 hashing, server-stamped recorded_at inside the hashed payload]
    - name: sr_status_events sub-ledger + G13 version rows
      max_iterations: 6
      repeat_until: status transitions append hash-chained sr_status_events rows; g13 stores append-only
        document_versions with checkout_locks and ERR-G13-DOCUMENT_LOCKED on conflicting checkIn.
      steps: [status sub-ledger appends + chaining, g13 version-row store, checkout/checkin lock protocol]
    - name: Oracle tests + verify
      max_iterations: 4
      repeat_until: apps/api/test contains the sha256 known-vector test, a status sub-ledger chaining test, and
        NEGATIVE append-only tests (version-row mutation rejected; locked checkIn rejected with
        ERR-G13-DOCUMENT_LOCKED); `npm run typecheck` + `npm test` pass; `bash docs/spec/pipeline/checks/ph-10a.sh` GREEN.
      steps: [write executed tests, run typecheck/test, run oracle, fix]
  evidence_required:
    - apps/api/src exporting sha256Hex; g12/g13 free of pseudoHash64; sr_status_events + document_versions +
      checkout_locks in module source
    - apps/api/test/*.test.cjs: known-vector, chain, and append-only negative tests
    - `bash docs/spec/pipeline/checks/ph-10a.sh` GREEN (external oracle; not self-certified)
  escalate_when:
    - Existing chained rows would be invalidated by the hash swap with no migration path defined — surface it.
    - Another module depends on pseudoHash64 semantics in a way this phase may not touch (record, do not fix there).
