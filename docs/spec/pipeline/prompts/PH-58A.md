# PH-58A — Raise contract coverage: G11 disbursement + lifecycle read route exposure

## Objective
Deepen G11 coverage (36.7% → higher, second pass): expose pension disbursement (transmit + list) and the
pensioner lifecycle reads (life certificates, pensioner-by-case) as kernel routes over already-tested
`pensionDisbursement` / `pensionerLifecycle` backing.

## Context
- Backing (`apps/api/src/modules/g11/`): `pensionDisbursementService.disburse` (integer-paise; disbursable
  guard) / `listDisbursements`; `pensionerLifecycleService.listLifeCertificates` (requires an existing
  pensioner) / `findPensionerByCase`.
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- Money stays integer paise. Preserve guards: non-positive paise → VALIDATION_FAILED (400); life
  certificates for an unknown pensioner fail closed (NOT_FOUND 404).
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 532/40.2% → 536/40.5%.

## Evidence required
- 4 routes in `g11.routes.ts`; `apps/api/test/ph58a-*.test.cjs` covering the disburse 400 guard, the
  disbursement/pensioner reads, and the life-certificate NOT_FOUND guard.
- `bash docs/spec/pipeline/checks/ph-58a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is repository-only (not on the service) — skip it and pick another real service method.
