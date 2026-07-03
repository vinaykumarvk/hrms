# PH-59 (Remediation Tranche 46) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-58-verdict.md` (tranche 45)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **558 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-59A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. Second-pass deepening tranche, into G06. Built by hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 46 closed — coverage ratcheted further with real, tested routes

| Module | Route exposure | Backing | Evidence |
|---|---|---|---|
| **G06** | succession-planning (`POST /promotions/succession-plans`, `:add-candidate`, `GET /promotions/succession-plans/{id}`, `GET /promotions/career-paths/{id}`) + qualifying-service (`GET /promotions/orders`, `POST /promotions/qualifying-service:compute`, `GET /promotions/qualifying-service/{snapshotId}`) | existing `careerSuccessionService` + `promotionService` (duplicate-candidate + exclusion-rule/snapshot NOT_FOUND guards), service-tested | `ph59a-g06-succession-qsl-route.test.cjs` |

Real behavioral routes over already-tested backing — **not** scaffolding. Measured contract coverage ratchets
**536 / 40.5% → 543 / 41%** (G06 **36% → 44.2%**), and the PH-37 gate floor was raised in lockstep so the gain
is locked.

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 41%** — ~780 of the **1,323** contracted operations remain unimplemented. The
  coverage tool is still **count-based**, not per-operation path matching. The route-exposure vein continues
  to thin (only a handful of exposable service methods remain per module: G12 admissibility reads, G03
  attendance-ops, G02 governance); the bulk of the residual requires **net-new implementation** (new backing
  + schema + tests).
- **Persistence workstream:** the hand-built services (PH-16F..PH-59 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **543** are
implemented as behavioral kernel routes (**41%**).

## Recommendation for the human reviewer

Approve PH-59B, OR direct a further tranche (PH-60). The active workstream (per your steer) is raising
measured coverage by exposing real, tested backing, with the ratchet gate proving each gain and forbidding
regression; a few small exposure tranches remain before the work necessarily shifts to net-new implementation
and the persistence migration. Carried debt is unchanged: in-memory repositories for the newest services.
