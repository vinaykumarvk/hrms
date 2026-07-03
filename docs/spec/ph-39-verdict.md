# PH-39 (Remediation Tranche 26) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-38-verdict.md` (tranche 25)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **503 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-39A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. Second tranche of the user-directed "raise contract coverage" workstream. Built by hand — subagents
credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 26 closed — coverage ratcheted further with real, tested routes

| Module | Route exposure | Backing | Evidence |
|---|---|---|---|
| **G08** | APAR PIP lifecycle (`POST /pips`, `.../{id}/milestones/{milestoneId}:update`, `:close`), probation-confirmation (`POST /probation-confirmations`, `:decide`), and reads (`GET /apar/forms/{id}/report-periods`, `/goal-snapshots`) | existing `aparService` methods (PIP one-open-per-employee + ≥1 milestone guards; probation cumulative extension cap), previously service-tested at `ph16e-g07-g08-depth` | `ph39a-g08-pip-probation-route.test.cjs` |

Real behavioral routes over already-tested backing — **not** scaffolding. Measured contract coverage
ratchets **397 / 30% → 404 / 30.5%** (G08 **19.5% → 24.8%**), and the PH-37 gate floor was raised in lockstep
so the gain is locked. A `requiredNumber` body helper was added so JSON numeric fields parse correctly (the
prior calibration routes only worked because the test sent numeric strings).

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 30.5%** — ~919 of the **1,323** contracted operations remain unimplemented. The
  coverage tool is still **count-based**, not per-operation path matching. Workstream continues: next
  candidates are the remaining G08 read endpoints and the low-coverage modules G07 (16.2%), G01, G14.
- **Persistence workstream:** the hand-built services (PH-16F..PH-39 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **404** are
implemented as behavioral kernel routes (**30.5%**).

## Recommendation for the human reviewer

Approve PH-39B, OR direct a further tranche (PH-40). The active workstream (per your steer) is raising
measured coverage by exposing real, tested backing, with the ratchet gate proving each gain and forbidding
regression. The standing **persistence migration workstream** remains the alternative. Carried debt is
unchanged: in-memory repositories for the newest services.
