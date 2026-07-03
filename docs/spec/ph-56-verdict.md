# PH-56 (Remediation Tranche 43) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-55-verdict.md` (tranche 42)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **550 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-56A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. Second-pass deepening tranche, into G10. Built by hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 43 closed — coverage ratcheted further with real, tested routes

| Module | Route exposure | Backing | Evidence |
|---|---|---|---|
| **G10** | FR-16 payroll engine-run lifecycle (`POST /payroll/engine-runs`, `:snapshot`, `:compute`, `:approve`, `:lock`, `GET /payroll/engine-runs/{id}`, `/payroll/engine-runs/{id}/payslips`) | existing `payrollEngineService` (period YYYY-MM guard; snapshot→compute→approve(SoD)→lock state machine; ERR-G10-RUN-INFLIGHT / PAYROLL_SOD / ERR-G10-RUN-IMMUTABLE guards), service-tested | `ph56a-g10-engine-run-route.test.cjs` |

Real behavioral routes over already-tested backing — **not** scaffolding. Measured contract coverage ratchets
**519 / 39.2% → 526 / 39.8%** (G10 **34.5% → 42.5%**), and the PH-37 gate floor was raised in lockstep so the
gain is locked. The route test drives create + reads for real and exercises the mutation routes via their
NOT_FOUND guards; the full snapshot→lock happy path (which requires a configured payroll rule set) is
covered by the engine's own service-level tests — an honest split, not a skipped assertion.

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 39.8%** — ~797 of the **1,323** contracted operations remain unimplemented. The
  coverage tool is still **count-based**, not per-operation path matching. The second pass continues into the
  next-lowest modules **G14 (28.9%)**, G13 (31.6%), G07 (33.3%), and the FnF/recovery cluster still open in G10.
- **Persistence workstream:** the hand-built services (PH-16F..PH-56 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **526** are
implemented as behavioral kernel routes (**39.8%**).

## Recommendation for the human reviewer

Approve PH-56B, OR direct a further tranche (PH-57). The active workstream (per your steer) is raising
measured coverage by exposing real, tested backing, with the ratchet gate proving each gain and forbidding
regression; the second pass continues, going deeper into each module. The standing **persistence migration
workstream** remains the alternative. Carried debt is unchanged: in-memory repositories for the newest services.
