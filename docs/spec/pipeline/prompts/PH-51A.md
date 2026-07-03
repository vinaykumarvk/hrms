# PH-51A — Raise contract coverage: G04 outbound-integration + relay route exposure

## Objective
Continue the coverage workstream into G04 (31.1%): expose the X.3 outbound-integration connector lifecycle
and the leave→SR relay enqueue/dead-letter reads as kernel routes over already-tested backing.

## Context
- Backing (`apps/api/src/modules/g04/`): `outboundIntegrationService.registerConnector/send (circuit-breaker
  + dead-letter)/runConformance/getConnector`; `leaveSrRelayService.enqueueApprovedLeave/
  enqueueLeaveCancellation/listDeadLetters`.
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- Preserve guards: OPEN breaker short-circuits send (PRECONDITION_FAILED); conformance re-runs a send.
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 482/36.4% → 489/37%.

## Evidence required
- 7 routes in `g04.routes.ts`; `apps/api/test/ph51a-*.test.cjs` covering register→send(DELIVERED)→
  conformance(passed)→read, and relay enqueue-approved + enqueue-cancellation + dead-letter read.
- `bash docs/spec/pipeline/checks/ph-51a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is repository-only (not on the service) — skip it and pick another real service method.
