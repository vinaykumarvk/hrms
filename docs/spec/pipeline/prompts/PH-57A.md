# PH-57A — Raise contract coverage: G10 FnF + recovery route exposure

## Objective
Deepen G10 coverage further: expose the FR-20 full-and-final settlement lifecycle (settle → approve) and the
recovery/loan/hold reads as kernel routes over already-tested `compensationIntegration` backing. Total
coverage crosses 40% this tranche.

## Context
- Backing (`apps/api/src/modules/g10/compensationIntegrationService.ts`): `settleFnf` (integer-paise
  validation; single consolidated record per employee → CONFLICT), `approveFnfSettlement` (SoD;
  COMPUTED-only), `listFnfSettlements`, `listRecoverySchedules`, `listLoans`, `listHolds`.
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- Money stays integer paise. Preserve guards: negative paise → VALIDATION_FAILED (400); duplicate FnF →
  CONFLICT (409); approval SoD (creator ≠ approver); approve requires COMPUTED.
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 526/39.8% → 532/40.2%.

## Evidence required
- 6 routes in `g10.routes.ts`; `apps/api/test/ph57a-*.test.cjs` covering settle→approve(SoD), the duplicate
  409 + negative-paise 400 guards, and the recovery/loan/hold reads.
- `bash docs/spec/pipeline/checks/ph-57a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is repository-only (not on the service) — skip it and pick another real service method.
