# PH-38 (Remediation Tranche 25) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-37-verdict.md` (tranche 24)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **500 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-38A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. This is the first tranche of the **user-directed "raise contract coverage" workstream**. Built by
hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 25 closed — coverage ratcheted with real, tested routes (no scaffolding)

| Module | Route exposure | Backing | Evidence |
|---|---|---|---|
| **G08** | APAR calibration lifecycle: `POST /calibration-sessions`, `:recommend`, `.../{recommendationId}:ratify`, `:apply`, `GET .../distribution` | existing `aparService` calibration methods (SoD on ratify; fail-closed `ERR-G08-RATIFY` on apply; read-only diagnostic), previously service-tested at `ph16e-g07-g08-depth` | `ph38a-g08-calibration-route.test.cjs` |

These are **real behavioral routes over already-tested backing** — deliberately *not* skeleton routes minted
to inflate the number. Measured contract coverage ratchets **392 / 29.6% → 397 / 30%** (G08 **15.8% → 19.5%**),
and the PH-37 gate's floor was raised in lockstep (report + `ph37a` test + `ph-37a.sh`) so the gain is locked.

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 30%** — ~926 of the **1,323** contracted operations remain unimplemented. The
  coverage tool is still **count-based**, not per-operation path matching. This workstream continues: the
  next candidates are other modules with real-but-unexposed backing (e.g. the APAR PIP lifecycle and
  probation-confirmation methods, and low-coverage G07/G01/G14 read endpoints).
- **Persistence workstream:** the hand-built services (PH-16F..PH-38 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **397** are
implemented as behavioral kernel routes (**30%**).

## Recommendation for the human reviewer

Approve PH-38B, OR direct a further tranche (PH-39). The active workstream (per your steer) is **raising
measured coverage** by exposing real, tested backing — the ratchet gate proves each gain and forbids
regression. The standing **persistence migration workstream** remains available as the alternative. Carried
debt is unchanged: in-memory repositories for the newest services.
