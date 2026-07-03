# PH-62A — Net-new implementation: G01 FR-EPM-004 nominee register

## Objective
This is the **first net-new tranche** (the route-exposure vein is exhausted). Implement the FR-EPM-004
nominee register **end-to-end** — new backing, not a wiring of an existing engine.

## Context
- Contract: `docs/contracts/openapi/G01.yaml` `Nominee` schema + `/employees/{id}/nominees` (GET/POST/PATCH/
  DELETE); BRD `docs/brd/v3/G01-employee-profile-management.md` FR-EPM-004 (VAL-NOMINEE).
- The employee master (`employeeMasterService.getById`) is the existence source; nominees are a new satellite.

## What to build
- `apps/api/src/modules/g01/nomineeService.ts` — `NomineeRepository` interface + `InMemoryNomineeRepository`
  + `NomineeService` with `listNominees`, `addNominee`, `updateNominee`, `removeNominee`.
- Business rule **VAL-NOMINEE**: ACTIVE nominee shares for one employee + benefit_type may not exceed 100
  (register `VAL-NOMINEE` in `types.ts` G01 union; map to **422** in `errors.ts`).
- Optimistic locking on update (row_version → CONFLICT 409); soft-delete (status INACTIVE) frees the share.
- Wire `services.nominee` in `foundationServices.ts`; register the 4 routes in `g01.routes.ts`.

## Constraints
- **Real behavior, no stubs.** The share invariant, optimistic lock, and soft-delete must actually work.
- Every mutation audited (P05); reads validate the employee exists (NOT_FOUND).

## Evidence required
- `apps/api/test/ph62a-*.test.cjs` covering the 100%-cap (VAL-NOMINEE 422), independent per-benefit budgets,
  optimistic-lock 409, and soft-delete freeing the share.
- `bash docs/spec/pipeline/checks/ph-62a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- The contract's invariant is ambiguous (record the assumption in the service doc comment).
