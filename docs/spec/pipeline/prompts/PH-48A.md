# PH-48A — Raise contract coverage: G12 chain-read + verify route exposure

## Objective
Continue the coverage workstream into G12 (43.1%): expose the SR-ledger chain reads and the RFC-3161
timestamp / offline-bundle verification counterparts as kernel routes over already-tested backing.

## Context
- Backing (`apps/api/src/modules/g12/`): `serviceRegisterService.getEntryChain/getStatusChain/getStatusEvents/
  listChainEmployees/listFeedEvents`; `timestampAuthorityService.verifyTimestamp`;
  `offlineVerificationService.verifyBundle`.
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- Verify routes round-trip against the existing issue routes: `verifyTimestamp` against `issueTimestamp`,
  `verifyBundle` against `issueVerificationBundle`; a tampered payload/token must return `valid:false`.
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 462/34.9% → 469/35.4%.

## Evidence required
- 7 routes in `g12.routes.ts`; `apps/api/test/ph48a-*.test.cjs` covering the chain reads (after seeding an
  SR event), the timestamp verify round-trip (+ tamper → invalid), and the bundle verify round-trip.
- `bash docs/spec/pipeline/checks/ph-48a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is a stub, or a verify method's semantics are ambiguous (record the assumption).
