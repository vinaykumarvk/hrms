# PH-60A — Raise contract coverage: G03 attendance-policy config + read route exposure

## Objective
Deepen G03 coverage: expose the attendance-policy configuration and the leave-ledger / attendance /
comp-off-balance reads as kernel routes over already-tested `leave` / `attendanceOps` backing.

## Context
- Backing (`apps/api/src/modules/g03/`): `leaveService.configureAttendancePolicy` (backdate window /
  regularisation cap / half-day minutes, all must be > 0), `listLedger`, `listAttendance`;
  `attendanceOpsService.getCompOffBalance`.
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- Preserve guards: a non-positive policy window/cap → VALIDATION_FAILED (400).
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 543/41% → 547/41.3%.

## Evidence required
- 4 routes in `g03.routes.ts`; `apps/api/test/ph60a-*.test.cjs` covering policy config (+ 400 guard) and the
  ledger/attendance/comp-off-balance reads.
- `bash docs/spec/pipeline/checks/ph-60a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is repository-only (not on the service) — skip it and pick another real service method.
