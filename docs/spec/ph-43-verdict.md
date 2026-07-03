# PH-43 (Remediation Tranche 30) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-42-verdict.md` (tranche 29)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **515 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-43A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. Sixth tranche of the user-directed "raise contract coverage" workstream, moving into G14. Built by
hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 30 closed — coverage ratcheted further with real, tested routes

| Module | Route exposure | Backing | Evidence |
|---|---|---|---|
| **G14** | analytics-engine reads (`GET /analytics/kpis/{code}/series`, `/analytics/datamarts`, `/analytics/scope-policies`), KPI target-setting (`POST /analytics/kpis/{code}/targets`), cohort drill (`GET /analytics/datamarts/{martCode}/cohort`), predictive attrition reads (`GET /analytics/attrition-scores`) | existing `analyticsEngineService` (ACTIVE-KPI guard on set-target; cross-version acknowledgement on series; min-cell suppression on cohort) + `predictiveAnalyticsService.listScores`, service-tested | `ph43a-g14-analytics-engine-route.test.cjs` |

Real behavioral routes over already-tested backing — **not** scaffolding. Measured contract coverage ratchets
**430 / 32.5% → 436 / 33%** (G14 **22.2% → 28.9%**), and the PH-37 gate floor was raised in lockstep so the
gain is locked.

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 33%** — ~887 of the **1,323** contracted operations remain unimplemented. The
  coverage tool is still **count-based**, not per-operation path matching. The workstream continues into the
  remaining low-coverage modules **G13 (25.4%)**, G01 (21.8%), G11, G10.
- **Persistence workstream:** the hand-built services (PH-16F..PH-43 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **436** are
implemented as behavioral kernel routes (**33%**).

## Recommendation for the human reviewer

Approve PH-43B, OR direct a further tranche (PH-44). The active workstream (per your steer) is raising
measured coverage by exposing real, tested backing, with the ratchet gate proving each gain and forbidding
regression; next candidates move to G13/G01/G11. The standing **persistence migration workstream** remains
the alternative. Carried debt is unchanged: in-memory repositories for the newest services.
