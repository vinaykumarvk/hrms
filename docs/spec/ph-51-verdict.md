# PH-51 (Remediation Tranche 38) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-50-verdict.md` (tranche 37)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **537 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-51A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. Fourteenth tranche of the user-directed "raise contract coverage" workstream, moving into G04. Built
by hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 38 closed — coverage ratcheted further with real, tested routes

| Module | Route exposure | Backing | Evidence |
|---|---|---|---|
| **G04** | X.3 outbound-integration connector lifecycle (`POST /integration/connectors`, `:send`, `:conformance`, `GET /integration/connectors/{id}`) + leave→SR relay (`POST /leave-sr/enqueue-approved`, `/leave-sr/enqueue-cancellation`, `GET /leave-sr/dead-letters`) | existing `outboundIntegrationService` (circuit-breaker + dead-letter + conformance self-test) + `leaveSrRelayService`, service-tested | `ph51a-g04-outbound-relay-route.test.cjs` |

Real behavioral routes over already-tested backing — **not** scaffolding. Measured contract coverage ratchets
**482 / 36.4% → 489 / 37%** (G04 **31.1% → 46.7%**), and the PH-37 gate floor was raised in lockstep so the
gain is locked.

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 37%** — ~834 of the **1,323** contracted operations remain unimplemented. The
  coverage tool is still **count-based**, not per-operation path matching. The workstream continues into the
  remaining lower-coverage modules **G06 (29.1%)**, G09 (28.1%), G05, and deeper into every module.
- **Persistence workstream:** the hand-built services (PH-16F..PH-51 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **489** are
implemented as behavioral kernel routes (**37%**).

## Recommendation for the human reviewer

Approve PH-51B, OR direct a further tranche (PH-52). The active workstream (per your steer) is raising
measured coverage by exposing real, tested backing, with the ratchet gate proving each gain and forbidding
regression; next candidates move to G06/G09/G05. The standing **persistence migration workstream** remains
the alternative. Carried debt is unchanged: in-memory repositories for the newest services.
