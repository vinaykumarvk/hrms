# PH-40A — Raise contract coverage: G08 feedback + signature route exposure

## Objective
Continue the coverage workstream: expose G08 continuous-feedback (check-in + reads), 360-feedback
(rate/release/read), and digital-signature reads as kernel routes over already-tested backing; ratchet floor.

## Context
- Backing (`apps/api/src/modules/g08/`): `continuousFeedbackService.recordCheckIn/listFeedback/listCheckIns`,
  `feedback360Service.submitRating/release360/get360`, `digitalSignatureService.listSignatures`.
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- List endpoints read required filters from `context.request.query` (cycleId + appraiseeId); a missing
  filter fails closed (VALIDATION_FAILED → 400).
- Preserve guards: 360 release blocked below MIN_RATERS (412); self-rating forbidden; score 1..5.
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 404/30.5% → 411/31.1%.

## Evidence required
- 7 routes in `g08.routes.ts`; `apps/api/test/ph40a-*.test.cjs` covering the 360 rate→release→read path,
  the MIN_RATERS block, and continuous-feedback check-in + list + signatures read.
- `bash docs/spec/pipeline/checks/ph-40a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is a stub, or a guard's status mapping is ambiguous (record the assumption).
