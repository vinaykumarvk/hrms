# PH-63A — Net-new implementation: G01 FR-EPM-005 emergency-contact register

## Objective
Implement the FR-EPM-005 emergency-contact register **end-to-end** — new backing (second net-new tranche).

## Context
- Contract: `docs/contracts/openapi/G01.yaml` `EmergencyContact` schema + `/employees/{id}/emergency-contacts`
  (GET/POST/PATCH/DELETE); BRD `docs/brd/v3/G01-employee-profile-management.md` FR-EPM-005.
- The employee master is the existence source; emergency contacts are a new satellite.

## What to build
- `apps/api/src/modules/g01/emergencyContactService.ts` — `EmergencyContactRepository` +
  `InMemoryEmergencyContactRepository` + `EmergencyContactService` (list/add/update/remove).
- Business rule: within one employee, ACTIVE contacts hold **distinct call-order priorities** — a duplicate
  priority is a CONFLICT (409). List is sorted by priority.
- Optimistic locking on update (row_version → CONFLICT 409); soft-delete (INACTIVE) frees the priority.
- Wire `services.emergencyContact` in `foundationServices.ts`; register the 4 routes in `g01.routes.ts`.

## Constraints
- **Real behavior, no stubs.** The priority invariant, optimistic lock, and soft-delete must actually work.
- Every mutation audited (P05); reads validate the employee exists (NOT_FOUND).

## Evidence required
- `apps/api/test/ph63a-*.test.cjs` covering the duplicate-priority 409, sorted list, optimistic-lock 409,
  and soft-delete freeing the priority.
- `bash docs/spec/pipeline/checks/ph-63a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- The contract's priority semantics are ambiguous (record the assumption in the service doc comment).
