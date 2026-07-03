# PH-44 (Remediation Tranche 31) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-43-verdict.md` (tranche 30)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **518 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-44A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. Seventh tranche of the user-directed "raise contract coverage" workstream, moving into G13. Built by
hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 31 closed — coverage ratcheted further with real, tested routes

| Module | Route exposure | Backing | Evidence |
|---|---|---|---|
| **G13** | document checkout-lock lifecycle (`POST /documents/{id}:checkout`, `:release-checkout`, `GET /documents/{id}/checkout-lock`), `POST /documents/{id}:rescan`, and reads (`GET /documents/{id}/access-audit`, `/scan-results`, `GET /documents:by-module-ref`) | existing `documentVaultService` (holder-only release + not-checked-out guards; PENDING_SCAN rescan guard), service-tested | `ph44a-g13-checkout-route.test.cjs` |

Real behavioral routes over already-tested backing — **not** scaffolding. Measured contract coverage ratchets
**436 / 33% → 443 / 33.5%** (G13 **25.4% → 31.6%**), and the PH-37 gate floor was raised in lockstep so the
gain is locked. (A `/documents/{id}` path collision on the module-ref list was caught and fixed to the
`:by-module-ref` action convention.)

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 33.5%** — ~880 of the **1,323** contracted operations remain unimplemented. The
  coverage tool is still **count-based**, not per-operation path matching. The workstream continues into the
  remaining low-coverage modules **G01 (21.8%)**, G11 (30%), G10 (28.7%).
- **Persistence workstream:** the hand-built services (PH-16F..PH-44 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **443** are
implemented as behavioral kernel routes (**33.5%**).

## Recommendation for the human reviewer

Approve PH-44B, OR direct a further tranche (PH-45). The active workstream (per your steer) is raising
measured coverage by exposing real, tested backing, with the ratchet gate proving each gain and forbidding
regression; next candidates move to G01/G11/G10. The standing **persistence migration workstream** remains
the alternative. Carried debt is unchanged: in-memory repositories for the newest services.
