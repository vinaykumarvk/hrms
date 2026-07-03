# PH-61A — Raise contract coverage: G12/G13 admissibility + OCR route exposure

## Objective
Deepen G12 and G13 coverage: expose the SR admissibility/integrity reads and the OCR index management as
kernel routes over already-tested `srAdmissibility` / `srIntegrity` / `ocrSearch` backing.

## Context
- Backing: `srAdmissibilityService.listSubscriptions`; `srIntegrityService.listAttestations/getAttestation`;
  `ocrSearchService.indexDocumentFromPayload/listIndex`.
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- Avoid `/api/v1/documents/{id}` path collisions — use the `:action` convention for the OCR index list
  (a `/documents/ocr-index` sub-path is captured as an `{id}` and 404s).
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 547/41.3% → 552/41.7%.

## Evidence required
- 3 routes in `g12.routes.ts` + 2 in `g13.routes.ts`; `apps/api/test/ph61a-*.test.cjs` covering the G12 reads
  and the G13 OCR index-from-payload + list round trip.
- `bash docs/spec/pipeline/checks/ph-61a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is repository-only (not on the service) — skip it and pick another real service method.
