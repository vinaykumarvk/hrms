# PH-57 (Remediation Tranche 44) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-56-verdict.md` (tranche 43)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **553 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-57A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. Second-pass deepening tranche, into G10. Built by hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 44 closed — coverage crossed 40% with real, tested routes

| Module | Route exposure | Backing | Evidence |
|---|---|---|---|
| **G10** | FR-20 full-and-final settlement (`POST /payroll/fnf-settlements`, `:approve`) + recovery/loan/hold reads (`GET /payroll/fnf-settlements`, `/payroll/employees/{employeeId}/recovery-schedules`, `/loans`, `/payroll/runs/{runId}/holds`) | existing `compensationIntegrationService` (integer-paise validation; single consolidated record → CONFLICT; approval SoD; COMPUTED-only), service-tested | `ph57a-g10-fnf-recovery-route.test.cjs` |

Real behavioral routes over already-tested backing — **not** scaffolding. Measured contract coverage ratchets
**526 / 39.8% → 532 / 40.2%** (G10 **42.5% → 49.4%**) — **total coverage has crossed the 40% mark** — and the
PH-37 gate floor was raised in lockstep so the gain is locked.

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 40.2%** — ~791 of the **1,323** contracted operations remain unimplemented. The
  coverage tool is still **count-based**, not per-operation path matching. The second pass continues into the
  next-lowest modules **G14 (28.9%)**, G08 (30.1%), G13 (31.6%), G07 (33.3%) — most now have only repository-
  level or setup methods left, so future tranches will spread across several modules per pass.
- **Persistence workstream:** the hand-built services (PH-16F..PH-57 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **532** are
implemented as behavioral kernel routes (**40.2%**).

## Recommendation for the human reviewer

Approve PH-57B, OR direct a further tranche (PH-58). The active workstream (per your steer) is raising
measured coverage by exposing real, tested backing, with the ratchet gate proving each gain and forbidding
regression; the second pass continues. As the readily-exposable service backing is consumed, the honest next
frontier is **implementing net-new contracted operations** (not just wiring existing engines) and the
**persistence migration workstream**. Carried debt is unchanged: in-memory repositories for the newest services.
