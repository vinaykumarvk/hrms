# PH-55A — Raise contract coverage: G01 governed write-port route exposure

## Objective
Deepen G01 coverage (26.7% → higher, second pass): expose the governed employee write-ports (identity
change, transfer posting, probation confirmation) and the live-record/count reads as kernel routes over
already-tested `employeeMaster` backing.

## Context
- Backing (`apps/api/src/modules/g01/employeeMasterService.ts`): `governedIdentityChange` (atomic SR-ledger
  multi-step write + attribute history), `applyTransferPosting`, `applyProbationConfirmation` (write-ports
  that other modules call — G01 owns the master mutation), `getLiveRecordForIdentityOps`,
  `listLiveRecordsForIdentityOps`, `count`.
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- Preserve guards: unknown employee fails closed (NOT_FOUND 404); identity change requires a reason;
  the governed identity change passes `context.idempotencyKey` (atomic SR-ledger write).
- Avoid `/api/v1/employees/{id}` path collisions — use the `:action` convention for count/list-live-records.
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 513/38.8% → 519/39.2%.

## Evidence required
- 6 routes in `g01.routes.ts`; `apps/api/test/ph55a-*.test.cjs` covering the three write-ports, the
  live-record/count reads, and the NOT_FOUND guard.
- `bash docs/spec/pipeline/checks/ph-55a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is repository-only (not on the service) — skip it and pick another real service method.
