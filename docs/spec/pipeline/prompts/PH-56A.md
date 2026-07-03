# PH-56A — Raise contract coverage: G10 payroll engine-run route exposure

## Objective
Deepen G10 coverage (34.5% → higher, second pass): expose the FR-16 payroll engine-run lifecycle
(create → snapshot → compute → approve → lock) and its reads as kernel routes over already-tested
`payrollEngine` backing.

## Context
- Backing (`apps/api/src/modules/g10/payrollEngineService.ts`): `createEngineRun` (period YYYY-MM;
  ERR-G10-RUN-INFLIGHT on a second FINAL run), `snapshotRunInputs` (needs a configured rule set),
  `computeEngineRun`, `approveEngineRun` (SoD: maker≠approver, PAYROLL_SOD), `lockEngineRun`
  (ERR-G10-RUN-IMMUTABLE thereafter), `getEngineRun`, `listRunPayslips`.
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- Preserve guards: unknown run fails closed (NOT_FOUND 404); period YYYY-MM (VALIDATION_FAILED 400);
  approval SoD; state-machine preconditions.
- The full happy path requires payroll rule setup; the test drives create + reads for real and exercises
  the mutation routes via their NOT_FOUND guards (the state-machine happy path is covered by engine tests).
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 519/39.2% → 526/39.8%.

## Evidence required
- 7 routes in `g10.routes.ts`; `apps/api/test/ph56a-*.test.cjs` covering create + reads, the period 400
  guard, and the mutation NOT_FOUND guards.
- `bash docs/spec/pipeline/checks/ph-56a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is repository-only (not on the service) — skip it and pick another real service method.
