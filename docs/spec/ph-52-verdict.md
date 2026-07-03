# PH-52 (Remediation Tranche 39) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-51-verdict.md` (tranche 38)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **540 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-52A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. Fifteenth tranche of the user-directed "raise contract coverage" workstream, moving into G06. Built
by hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 39 closed — coverage ratcheted further with real, tested routes

| Module | Route exposure | Backing | Evidence |
|---|---|---|---|
| **G06** | FR-015 sanctioned-posts establishment lifecycle (`POST /promotions/sanctioned-posts`, `:revise`, `:reconcile`, `GET /promotions/sanctioned-posts/{id}`, `GET /promotions/sanctioned-posts`, `GET /promotions/sanctioned-posts/{id}/vacancy`) | existing `promotionService` (maker≠checker SoD + quota-split validation on register/revise; STRENGTH_INCONSISTENT on reconcile; vacancy computation), service-tested | `ph52a-g06-sanctioned-post-route.test.cjs` |

Real behavioral routes over already-tested backing — **not** scaffolding. Measured contract coverage ratchets
**489 / 37% → 495 / 37.4%** (G06 **29.1% → 36%**), and the PH-37 gate floor was raised in lockstep so the gain
is locked.

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 37.4%** — ~828 of the **1,323** contracted operations remain unimplemented. The
  coverage tool is still **count-based**, not per-operation path matching. The workstream continues into the
  remaining lower-coverage modules **G09 (28.1%)**, G05, and deeper into every module (G01, G14, G13, G10).
- **Persistence workstream:** the hand-built services (PH-16F..PH-52 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **495** are
implemented as behavioral kernel routes (**37.4%**).

## Recommendation for the human reviewer

Approve PH-52B, OR direct a further tranche (PH-53). The active workstream (per your steer) is raising
measured coverage by exposing real, tested backing, with the ratchet gate proving each gain and forbidding
regression; next candidates move to G09/G05 and deeper across every module. The standing **persistence
migration workstream** remains the alternative. Carried debt is unchanged: in-memory repositories for the
newest services.
