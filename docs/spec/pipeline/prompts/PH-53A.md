# PH-53A — Raise contract coverage: G09 disciplinary route exposure

## Objective
Continue the coverage workstream into G09 (28.1%): expose suspension review, show-cause response,
consultation close/waive, personal-hearing minutes, and case reads as kernel routes over already-tested
`disciplinary` backing.

## Context
- Backing (`apps/api/src/modules/g09/disciplinaryService.ts`): `reviewSuspension`, `respondToShowCause`,
  `closeConsultation`, `waiveConsultation`, `recordPersonalHearingMinutes`, `listCaseTimeline`,
  `listIccAppointments`, `listPersonalHearings`, `getPenaltyOrder`.
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- Preserve guards: mutating an unknown subject fails closed (NOT_FOUND 404).
- Honour the PH-04D route-metadata invariant: a GET path ending in `/timeline` must be paginated — use a
  non-`/timeline` suffix (`/case-timeline`) for the array read to avoid the pagination requirement.
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 495/37.4% → 504/38.1%.

## Evidence required
- 9 routes in `g09.routes.ts`; `apps/api/test/ph53a-*.test.cjs` covering the case reads and the mutation
  routes' NOT_FOUND guards.
- `bash docs/spec/pipeline/checks/ph-53a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A global route-metadata invariant (PH-04D) trips — adjust the route to honour it, do not weaken the check.
