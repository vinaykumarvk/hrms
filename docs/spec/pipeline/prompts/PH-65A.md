# PH-65A — Net-new implementation: G01 FR-EPM-008 bank-account register

## Objective
Implement the FR-EPM-008 bank-account register **end-to-end** — new backing (fourth net-new tranche).

## Context
- Contract: `docs/contracts/openapi/G01.yaml` `BankAccount` schema + `/employees/{id}/bank-accounts`; BRD
  `docs/brd/v3/G01-employee-profile-management.md` FR-EPM-008 (VAL-IFSC; pending-until-approved; penny-drop).

## What to build
- `apps/api/src/modules/g01/bankAccountService.ts` — repository + `InMemoryBankAccountRepository` +
  `BankAccountService` (list/add/update/approve/penny-drop/remove).
- **VAL-IFSC**: IFSC must match the RBI format `^[A-Z]{4}0[A-Z0-9]{6}$` (register `VAL-IFSC` in `types.ts`
  G01 union; map to **422** in `errors.ts`).
- Single primary-salary invariant (promotion auto-demotes the prior primary); add creates PENDING;
  maker-checker approve (PENDING→APPROVED, PRECONDITION otherwise); penny-drop tri-state (VERIFIED sets
  is_verified); an account-detail change re-enters PENDING; optimistic locking; soft-delete.
- Wire `services.bankAccount` in `foundationServices.ts`; register the 6 routes in `g01.routes.ts`.

## Constraints
- **Real behavior, no stubs.** The IFSC guard, single-salary invariant, approval lifecycle, penny-drop
  tri-state, and re-enter-PENDING behaviour must all actually work.
- Every mutation audited (P05); reads validate the employee exists (NOT_FOUND).

## Evidence required
- `apps/api/test/ph65a-*.test.cjs` covering VAL-IFSC 422, single-primary demotion, approve lifecycle +
  re-approve 412, penny-drop VERIFIED, and detail-change re-enters PENDING.
- `bash docs/spec/pipeline/checks/ph-65a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- The IFSC/penny-drop semantics are ambiguous (record the assumption in the service doc comment).
