# PH-49A — Raise contract coverage: G02 step-up + template route exposure

## Objective
Continue the coverage workstream into G02 (38.5%): expose the step-up MFA lifecycle and change-request
template management as kernel routes over already-tested backing.

## Context
- Backing (`apps/api/src/modules/g02/`): `changeEsignStepUpService.challengeStepUp/verifyStepUp (expiry ->
  ERR-G02-STEPUP)/listEsignatures`; `changeRequestTemplateService.listTemplates/deactivateTemplate/
  startFromTemplate`. (`latestVerifiedStepUp` is repository-only, not a service method — do not route it.)
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- Preserve guards: verifying a step-up after its `expiresAt` fails closed (ERR-G02-STEPUP → 403).
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 469/35.4% → 475/35.9%.

## Evidence required
- 6 routes in `g02.routes.ts`; `apps/api/test/ph49a-*.test.cjs` covering step-up challenge→verify (+ expired
  → 403), esignature read, and template create→list→start→deactivate.
- `bash docs/spec/pipeline/checks/ph-49a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is repository-only (not on the service) — skip it and pick another real service method.
