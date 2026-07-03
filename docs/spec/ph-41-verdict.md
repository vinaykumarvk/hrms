# PH-41 (Remediation Tranche 28) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-40-verdict.md` (tranche 27)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **509 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-41A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. Fourth tranche of the user-directed "raise contract coverage" workstream, moving into G07. Built by
hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 28 closed — coverage ratcheted further with real, tested routes

| Module | Route exposure | Backing | Evidence |
|---|---|---|---|
| **G07** | FR-G07-020 training-sponsorship + service-bond lifecycle: `POST /training/sponsorships`, `:sanction`, `:activate-bond`, `:fulfil`, `:breach`, `:emit-recovery`, `:recover`, `:waive`, `GET /training/sponsorships/{id}`, `.../costs` | existing `trainingService` sponsorship methods (SoD on sanction; pro-rata bond recovery in integer paise; VAL-G07-BOND fail-closed on recover; idempotent G10 cost feed), service-tested | `ph41a-g07-sponsorship-route.test.cjs` |

Real behavioral routes over already-tested backing — **not** scaffolding. Measured contract coverage ratchets
**411 / 31.1% → 421 / 31.8%** (G07 **16.2% → 25.2%**), and the PH-37 gate floor was raised in lockstep so the
gain is locked.

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 31.8%** — ~902 of the **1,323** contracted operations remain unimplemented. The
  coverage tool is still **count-based**, not per-operation path matching. G07 has more unexposed backing
  (external-credential lifecycle, empanelment decisions, LMS statement ingest); the workstream continues
  there and into G14, G01, G13.
- **Persistence workstream:** the hand-built services (PH-16F..PH-41 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **421** are
implemented as behavioral kernel routes (**31.8%**).

## Recommendation for the human reviewer

Approve PH-41B, OR direct a further tranche (PH-42). The active workstream (per your steer) is raising
measured coverage by exposing real, tested backing, with the ratchet gate proving each gain and forbidding
regression. The standing **persistence migration workstream** remains the alternative. Carried debt is
unchanged: in-memory repositories for the newest services.
