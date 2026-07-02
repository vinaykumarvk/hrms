/goal
  objective: Implement the G12 integrity pillars on top of the PH-10A substrate. Deliver: a ledger integrity VERIFY
    endpoint that walks an employee chain (entry hashes + sr_status_events sub-chain) and reports OK/FAIL with the
    first broken link; a scheduled recompute job registered as JOB-G12-INTEGRITY; the sr_anchors entity computing a
    REAL Merkle root over per-employee chain heads (external RFC 3161 TSA integration may sit behind an interface
    stub, but the Merkle computation itself must be real and test-verified); the completeness gap register
    (sr_expected_event_rule + sr_gap_register with GAP_FLAGGED via JOB-G12-GAPSCAN); custodian attestation records
    (sr_attestations); and certified extracts (sr_certified_extracts) that apply P02 redaction before rendering.
  context:
    - docs/reviews/brd-coverage-audit-20260702.md      # G12 gaps: anchor/status-chain/attestation, 35/46 NOT_FOUND
    - docs/brd/v3/G12-digital-service-register.md      # E20 sr_anchors, E21 sr_expected_event_rule, E22 sr_gap_register,
                                                       #   E11 sr_attestations, E14 sr_certified_extracts; JOB-G12-INTEGRITY,
                                                       #   JOB-G12-ANCHOR, JOB-G12-GAPSCAN; gap statuses GAP_FLAGGED..CLOSED_*
    - docs/data-model/12-G12-digital-service-register.sql   # authoritative table/column names
    - apps/api/src/modules/g12/** (PH-10A chain + sub-ledger) , apps/api/src/routes/g12.routes.ts
    - apps/api/src/jobs/jobService.ts                  # job registration surface for JOB-G12-*
    - apps/api/src/platform/authorization/** (P02)     # redaction rules consumed by certified extracts
  constraints:
    - Verify must recompute hashes from stored content — not compare stored hash to stored hash. A tampered copy of
      a chain must FAIL with the offending sequence number identified.
    - JOB-G12-INTEGRITY registers in the job runner by that literal id and reuses the same verify code path.
    - Merkle root: pairwise SHA-256 over sorted chain heads with the standard odd-node promotion rule you document
      in code; a change to any single chain head must change the root. The TSA call sits behind an injectable
      interface (a fake in tests is fine); the anchor row persists root, coverage window, and head count.
    - Gap scan: JOB-G12-GAPSCAN evaluates sr_expected_event_rule rows against recorded events and appends
      sr_gap_register rows with status GAP_FLAGGED; explanations move status through the BRD lifecycle, never delete.
    - Certified extracts snapshot the redacted rendering and record what was redacted (P02-driven, fail-closed for
      ungranted fields); extracts carry the chain-head hash they certify.
    - Executed tests must include: a tamper-detection test (mutate a copied chain row -> verify FAILs), a Merkle test
      (root changes when one head changes; recomputed root matches), and a gap-scan test (missing expected event ->
      GAP_FLAGGED row).
    - Parameterised queries; transactions for multi-step writes; no console.log; no stack traces in responses.
    - Do NOT weaken any oracle under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
  work_loops:
    - name: Verify endpoint + integrity job
      max_iterations: 6
      repeat_until: a g12 integrity verify endpoint recomputes entry + status chains and reports OK/FAIL with first
        failure position; JOB-G12-INTEGRITY is registered and drives the same path.
      steps: [chain recompute walker, verify route, register JOB-G12-INTEGRITY]
    - name: Anchors, gap register, attestation, extracts
      max_iterations: 8
      repeat_until: sr_anchors persists a real Merkle root over chain heads behind a stubbable TSA interface;
        JOB-G12-GAPSCAN + sr_expected_event_rule + sr_gap_register flag gaps as GAP_FLAGGED; sr_attestations records
        custodian attestation over a chain head; sr_certified_extracts renders with P02 redaction applied.
      steps: [merkle builder + anchor entity, expected-event rules + gap scan job, attestation entity, redacted extracts]
    - name: Oracle tests + verify
      max_iterations: 4
      repeat_until: apps/api/test contains the tamper NEGATIVE test, the Merkle root test, and the gap-scan test;
        `npm run typecheck` + `npm test` pass; `bash docs/spec/pipeline/checks/ph-10b.sh` GREEN.
      steps: [write executed tests, run typecheck/test, run oracle, fix]
  evidence_required:
    - apps/api/src/modules/g12/** pillars naming the BRD entities/jobs above; route for verify
    - apps/api/test/*.test.cjs: tamper-FAIL, Merkle, gap-scan tests
    - `bash docs/spec/pipeline/checks/ph-10b.sh` GREEN (external oracle; not self-certified)
  escalate_when:
    - The BRD's anchor cadence/coverage rules conflict with the DDL — surface before persisting anchors.
    - P02 lacks a redaction rule a certified extract needs (request the authorization-matrix amendment; fail closed meanwhile).
