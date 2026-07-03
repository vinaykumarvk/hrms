# PH-60 (Remediation Tranche 47) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-59-verdict.md` (tranche 46)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **561 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-60A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. Second-pass deepening tranche, into G03. Built by hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 47 closed — coverage ratcheted further with real, tested routes

| Module | Route exposure | Backing | Evidence |
|---|---|---|---|
| **G03** | attendance-policy config (`POST /attendance/policy`) + leave-ledger/attendance/comp-off-balance reads (`GET /leave/ledger`, `GET /attendance/records`, `GET /attendance/employees/{employeeId}/comp-off-balance`) | existing `leaveService` (positive-window policy guard) + `attendanceOpsService`, service-tested | `ph60a-g03-attendance-policy-route.test.cjs` |

Real behavioral routes over already-tested backing — **not** scaffolding. Measured contract coverage ratchets
**543 / 41% → 547 / 41.3%** (G03 **47.8% → 52.2%**), and the PH-37 gate floor was raised in lockstep so the
gain is locked.

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 41.3%** — ~776 of the **1,323** contracted operations remain unimplemented. The
  coverage tool is still **count-based**, not per-operation path matching. The route-exposure vein is now
  down to a small residue (a few methods in G02 governance, G12 admissibility, and scattered getters); the
  clear majority of the residual requires **net-new implementation** (new backing + schema + tests).
- **Persistence workstream:** the hand-built services (PH-16F..PH-60 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **547** are
implemented as behavioral kernel routes (**41.3%**).

## Recommendation for the human reviewer

Approve PH-60B, OR direct a further tranche (PH-61). The route-exposure vein is nearly dry; one or two small
exposure tranches remain (G02 governance, G12 admissibility) before the work necessarily shifts to net-new
implementation and the persistence migration workstream. Carried debt is unchanged: in-memory repositories
for the newest services.
