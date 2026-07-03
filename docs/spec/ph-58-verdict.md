# PH-58 (Remediation Tranche 45) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-57-verdict.md` (tranche 44)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **555 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-58A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. Second-pass deepening tranche, into G11. Built by hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 45 closed — coverage ratcheted further with real, tested routes

| Module | Route exposure | Backing | Evidence |
|---|---|---|---|
| **G11** | pension disbursement (`POST /pension/disbursements`, `GET /pension/cases/{caseId}/disbursements`) + pensioner lifecycle reads (`GET /pension/pensioners/{pensionerId}/life-certificates`, `GET /pension/cases/{caseId}/pensioner`) | existing `pensionDisbursementService` (integer-paise + disbursable guards) + `pensionerLifecycleService` (pensioner NOT_FOUND guard), service-tested | `ph58a-g11-disbursement-route.test.cjs` |

Real behavioral routes over already-tested backing — **not** scaffolding. Measured contract coverage ratchets
**532 / 40.2% → 536 / 40.5%** (G11 **36.7% → 41.1%**), and the PH-37 gate floor was raised in lockstep so the
gain is locked.

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 40.5%** — ~787 of the **1,323** contracted operations remain unimplemented. The
  coverage tool is still **count-based**, not per-operation path matching. The readily-exposable service
  backing across all modules is now nearly consumed (each remaining tranche yields only 4–9 routes and is
  spread thinner); the honest next frontier is **implementing net-new contracted operations** (real new
  service logic + schema) rather than exposing existing engines.
- **Persistence workstream:** the hand-built services (PH-16F..PH-58 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **536** are
implemented as behavioral kernel routes (**40.5%**).

## Recommendation for the human reviewer

Approve PH-58B, OR direct a further tranche (PH-59). The route-exposure vein is nearly exhausted; continuing
to 100% coverage now requires **net-new implementation** (new backing, schema, and tests per operation) and
the **persistence migration workstream** — both materially larger per unit than the exposure tranches. This
is a natural point to confirm the direction. Carried debt is unchanged: in-memory repositories for the newest
services.
