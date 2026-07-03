# PH-41A — Raise contract coverage: G07 sponsorship + service-bond route exposure

## Objective
Continue the coverage workstream into G07 (16.2%): expose the FR-G07-020 training-sponsorship + service-bond
lifecycle as kernel routes over already-tested `trainingService` backing; ratchet the floor.

## Context
- Backing (`apps/api/src/modules/g07/trainingService.ts`): `createSponsorship`, `sanctionSponsorship`
  (SoD: no self-sanction), `activateSponsorshipBond` (bond_end = completion + months), `fulfilSponsorshipBond`,
  `markSponsorshipBreached` (pro-rata recovery in integer paise), `emitBondRecoveryCost` (G10 feed, idempotent),
  `markSponsorshipRecovered` (VAL-G07-BOND: recovery cost must exist), `waiveSponsorship`, `getSponsorship`,
  `listSponsorshipCosts`.
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- Money stays integer paise; do not reshape the recovery arithmetic.
- Preserve guards: SoD on sanction, status preconditions, VAL-G07-BOND fail-closed on recover.
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 411/31.1% → 421/31.8%.

## Evidence required
- 10 routes in `g07.routes.ts`; `apps/api/test/ph41a-*.test.cjs` covering the fulfil path, the
  breach→emit→recover path (incl. the VAL-G07-BOND fail-closed), and waive + reads.
- `bash docs/spec/pipeline/checks/ph-41a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is a stub, or a guard's status mapping is ambiguous (record the assumption).
