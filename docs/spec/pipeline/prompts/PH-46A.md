# PH-46A — Raise contract coverage: G10 loan + perquisite route exposure

## Objective
Continue the coverage workstream into G10 (28.7%): expose the FR-G10-08 loan lifecycle (instalment recovery
with net-floor carryforward + foreclosure) and Rule-3 concessional perquisite valuation as kernel routes over
already-tested `loanPerquisiteGl` backing.

## Context
- Backing (`apps/api/src/modules/g10/loanPerquisiteGlService.ts`): `recordLoanInstalment` (net-floor cap +
  ERR-G10-RECOVERY-NET fail-closed + carryforward), `forecloseLoan`, `listLoanRepayments`, `listCarryforwards`,
  `valuePerquisite` (ERR-G10-PERQ-REFRATE when a concessional benefit has no reference rate). `sanctionLoan`
  is already routed.
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- Money stays integer paise; do not reshape the recovery/perquisite arithmetic.
- Preserve guards: ACTIVE-only instalment/foreclose; net-floor carryforward + 409; perquisite ref-rate 422.
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 451/34.1% → 456/34.5%.

## Evidence required
- 6 routes in `g10.routes.ts`; `apps/api/test/ph46a-*.test.cjs` covering instalment + net-floor 409 +
  carryforward read, foreclosure, and perquisite valuation (+ ref-rate 422).
- `bash docs/spec/pipeline/checks/ph-46a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is a stub, or a guard's status mapping is ambiguous (record the assumption).
