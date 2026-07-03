# PH-45A — Raise contract coverage: G01 Aadhaar reveal + legal-hold route exposure

## Objective
Continue the coverage workstream into G01 (21.8%): expose the Aadhaar reveal (4-eyes break-glass) lifecycle,
the employee legal-hold + blocking-obligation lifecycle, and service-no lookup as kernel routes over
already-tested backing.

## Context
- Backing (`apps/api/src/modules/g01/`): `aadhaarVaultService.requestReveal/approveReveal (4-eyes)/
  getVaultByEmployee`; `identityOpsService.placeLegalHold/releaseLegalHold/registerBlockingObligation/
  clearBlockingObligation` (wired as `services.employeeIdentityOps`); `employeeMasterService.getByServiceNo`.
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- Preserve guards: Aadhaar reveal 4-eyes (requester ≠ approver, 403); legal-hold release requires ACTIVE.
- Avoid `/api/v1/employees/{id}` path collisions — use the `:action` / query convention for the service-no
  lookup.
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 443/33.5% → 451/34.1%.

## Evidence required
- 8 routes in `g01.routes.ts`; `apps/api/test/ph45a-*.test.cjs` covering reveal request→approve (+ 4-eyes
  403), legal-hold place→release, obligation register→clear, and service-no lookup (+ 400 guard).
- `bash docs/spec/pipeline/checks/ph-45a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is a stub, or a guard's status mapping is ambiguous (record the assumption).
