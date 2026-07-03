# PH-42A — Raise contract coverage: G07 credential + empanelment route exposure

## Objective
Continue the coverage workstream: expose the FR-G07-018 external-credential verification lifecycle and the
vendor-empanelment review/decide flow as kernel routes over already-tested G07 backing; ratchet the floor.

## Context
- Backing (`apps/api/src/modules/g07/`): `trainingService.captureExternalCredential/reviewCredentialEvidence/
  verifyExternalCredential/rejectExternalCredential/getExternalCredential/listCredentialVerifications`
  (SoD, VAL-G07-CREDREF, VERIFIED significant credential posts to G12); `vendorEmpanelmentService.
  reviewEmpanelment/decideEmpanelment (4-eyes)/getEmpanelment`.
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- Preserve guards: credential SoD (submitter ≠ reviewer, 403), VAL-G07-CREDREF duplicate ref (409),
  status preconditions, empanelment 4-eyes (requester ≠ approver, 403).
- The verify route passes `context.idempotencyKey` to the service (VERIFIED significant credential → G12).
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 421/31.8% → 430/32.5%.

## Evidence required
- 9 routes in `g07.routes.ts`; `apps/api/test/ph42a-*.test.cjs` covering the credential lifecycle (incl.
  SoD + duplicate-ref), and empanelment apply→review→decide (incl. 4-eyes) + reads.
- `bash docs/spec/pipeline/checks/ph-42a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is a stub, or a guard's status mapping is ambiguous (record the assumption).
