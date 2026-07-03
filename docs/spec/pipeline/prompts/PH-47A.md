# PH-47A — Raise contract coverage: G11 PDA + verification route exposure

## Objective
Continue the coverage workstream into G11 (30%): expose the PDA (Pension Disbursing Authority) go-live
lifecycle, grievance close, and pensioner bank-account verification as kernel routes over already-tested
backing.

## Context
- Backing (`apps/api/src/modules/g11/`): `pensionTreasuryService.certifyPdaSandbox/activatePda (go-live gate:
  uncertified cannot activate)/getPda/closeGrievance`; `pensionDisbursementService.recordAccountVerification
  (requires a real pension case; supersedes prior ACTIVE)/listVerifications`.
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- Preserve guards: PDA activate requires `sandbox_certified` (412); verification validates method/result.
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 456/34.5% → 462/34.9%.

## Evidence required
- 6 routes in `g11.routes.ts`; `apps/api/test/ph47a-*.test.cjs` covering the PDA go-live gate (activate
  before certify → 412), grievance close, and account verification (set up a real pension case).
- `bash docs/spec/pipeline/checks/ph-47a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is a stub, or a guard's status mapping is ambiguous (record the assumption).
