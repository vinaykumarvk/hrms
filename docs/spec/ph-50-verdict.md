# PH-50 (Remediation Tranche 37) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-49-verdict.md` (tranche 36)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **535 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-50A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. Thirteenth tranche of the user-directed "raise contract coverage" workstream, moving into G03. Built
by hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 37 closed — coverage ratcheted further with real, tested routes

| Module | Route exposure | Backing | Evidence |
|---|---|---|---|
| **G03** | leave year-close simulate (`POST /leave/year-close:simulate`), leave encashment (`POST /leave/encashments`, `GET /leave/employees/{employeeId}/encashments`), mass-leave (`POST /leave/mass-leave`), punch-review (`POST /attendance/punch-reviews/{id}:resolve`, `GET /attendance/punch-reviews/{id}`), attendance exceptions (`GET /attendance/employees/{employeeId}/exceptions`) | existing `leaveYearCloseService` (encashment cap + NOT_ENCASHABLE guards) + `leaveBlackoutMassService` (≥1-member + blackout guards) + `punchAnomalyService` (SoD) + `attendanceExceptionService`, service-tested | `ph50a-g03-leave-attendance-route.test.cjs` |

Real behavioral routes over already-tested backing — **not** scaffolding. Measured contract coverage ratchets
**475 / 35.9% → 482 / 36.4%** (G03 **40.2% → 47.8%**), and the PH-37 gate floor was raised in lockstep so the
gain is locked. (`listActiveBlackouts` is a repository-only method, not a service method — not routed.)

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 36.4%** — ~841 of the **1,323** contracted operations remain unimplemented. The
  coverage tool is still **count-based**, not per-operation path matching. The workstream continues into the
  remaining lower-coverage modules **G04 (31.1%)**, G05, G06, G09.
- **Persistence workstream:** the hand-built services (PH-16F..PH-50 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **482** are
implemented as behavioral kernel routes (**36.4%**).

## Recommendation for the human reviewer

Approve PH-50B, OR direct a further tranche (PH-51). The active workstream (per your steer) is raising
measured coverage by exposing real, tested backing, with the ratchet gate proving each gain and forbidding
regression; next candidates move to G04/G05/G06. The standing **persistence migration workstream** remains
the alternative. Carried debt is unchanged: in-memory repositories for the newest services.
