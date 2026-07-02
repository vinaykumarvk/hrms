/goal
  objective: PH-07C — take the G02 personal-details workflow from single-field slice to BRD depth.
    The audit (docs/reviews/brd-coverage-audit-20260702.md) scored G02 at 14/118 CONFIRMED: field
    sensitivity is hardcoded (`fieldCode === "displayName" ? "LOW" : "HIGH"`), there is no approval
    matrix configuration, no SoD enforcement, no RETURNED/resubmit/withdraw statuses, no mandatory
    reject reason, no field diff endpoint, and no ERR-G02-* codes are emitted.
  audit_gaps_closed:
    - field_sensitivity_catalog entity (versioned config) replaces the hardcoded LOW/HIGH ternary; the
      workflow stage is chosen from the catalog entry of the changed field.
    - approval_matrix_config entity: approver stage/role per sensitivity + field group, consumed when the
      change-request workflow starts.
    - SoD maker != checker: an approver who created (or last edited) the change request is rejected with
      ERR-G02-SOD; enforced in the service, not the UI.
    - Full status depth: RETURNED via a sendBack action (approver returns with comments), resubmit of a
      RETURNED request, and withdraw of a pending request (WITHDRAWN) — transitions guarded per the frozen
      status enum in docs/data-model/02-G02-personal-details-workflow.sql.
    - Mandatory decision reason: REJECT and RETURN without a comment raise ERR-REASON-REQ.
    - Field diff endpoint: GET /api/v1/change-requests/{id}/diff returning old/new per field with P02
      masking applied to sensitive values for readers without unmask rights.
  context:
    - docs/brd/v3/G02-personal-details-modification-workflow.md   # statuses, ERR-G02-* registry, diff endpoint
    - docs/data-model/02-G02-personal-details-workflow.sql        # field_sensitivity_catalog, approval_matrix_config, status enum
    - apps/api/src/modules/g02/personalDetailsService.ts , apps/api/src/routes/g02.routes.ts
    - apps/api/src/platform/** (P02 masking, workflow service) , apps/api/src/db/**
  constraints:
    - Use BRD-registered codes verbatim (ERR-G02-SOD, ERR-REASON-REQ, other ERR-G02-* where the BRD names one); no synonyms.
    - Status names must match the frozen enum (RETURNED, WITHDRAWN, ...); do not invent transitions.
    - Persist the two config entities via the repository/migration path; parameterised queries; commit of an
      approved change (master update + history + outbox) is transactional.
    - P02 masking in the diff response must reuse the platform masking service; never expose raw sensitive values.
    - No production console.log; no stack traces or internal paths in API responses.
    - Do NOT weaken or edit any oracle under docs/spec/pipeline/checks/; do NOT touch docs/spec/pipeline/.state/ or approvals/.
  work_loops:
    - name: config entities + SoD
      max_iterations: 5
      repeat_until: field_sensitivity_catalog + approval_matrix_config are persisted, seeded, and drive stage
        selection; the hardcoded LOW/HIGH ternary is gone; maker==checker approval attempts raise ERR-G02-SOD.
      steps: [catalog + matrix entities, stage selection from config, SoD guard in decision path]
    - name: status depth + reasons + diff
      max_iterations: 5
      repeat_until: sendBack->RETURNED, resubmit, and withdraw transitions work with guards; REJECT/RETURN
        without comment raises ERR-REASON-REQ; GET /change-requests/{id}/diff returns per-field old/new with
        P02 masking; routes registered in g02.routes.ts.
      steps: [transition methods + guards, mandatory-reason validation, diff endpoint with masking]
    - name: tests + verify
      max_iterations: 4
      repeat_until: apps/api/test contains an SoD negative test (same actor submits and tries to approve ->
        ERR-G02-SOD), a mandatory-reason negative test (ERR-REASON-REQ), RETURNED->resubmit and withdraw
        coverage, and a masked-diff assertion; `npm run typecheck` + `npm test` green;
        `bash docs/spec/pipeline/checks/ph-07c.sh` GREEN.
      steps: [write negative + transition tests, run suites, run oracle, fix]
  freedom:
    - Catalog/matrix seed contents, versioning mechanics, and diff response shape (within the BRD endpoint
      contract) are yours to design.
    - How SoD identifies the maker (creator vs last editor) may follow the BRD's stricter reading; record the choice.
  evidence_required:
    - apps/api/src/modules/g02/** diffs, g02.routes.ts diff/sendBack/resubmit/withdraw routes, config migrations
    - tests: SoD negative, reason-required negative, status transitions, masked diff
    - `npm run typecheck` + `npm test` green; ph-07c.sh GREEN
  escalate_when:
    - The frozen status enum lacks a transition the BRD demands (amendment, not invention).
    - SoD cannot be evaluated because workflow task attribution is missing upstream.
