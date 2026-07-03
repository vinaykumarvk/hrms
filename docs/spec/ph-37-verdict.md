# PH-37 (Remediation Tranche 24) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-36-verdict.md` (tranche 23)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **498 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-37A oracle was run **externally** by the driver and is GREEN. This tranche builds the **contract-
conformance / coverage gate** — the CI-conformance item named across tranches 21–23. Built by hand —
subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 24 closed — the standing coverage caveat is now a tracked metric

Every prior verdict carried the caveat "implemented routes cover only a fraction of the ~1,306 OpenAPI
operations" as **unmeasured prose**. Tranche 24 replaces it with a **measured, executable, ratcheted** metric:

| Deliverable | Evidence |
|---|---|
| `tools/contract-coverage.mjs` — per-module coverage (contract ops in `docs/contracts/openapi/*.yaml` vs kernel routes attributed by `operationId`) | `node tools/contract-coverage.mjs` |
| Baseline report with per-module table + ratchet floor + honest limitation | `docs/reviews/contract-coverage-20260703.md` |
| `ph-37a.sh` gate — independently recomputes, ties implemented total to the live route registry, enforces the floor | GREEN (external) |
| Self-consistency test (tool ↔ `listRoutes()`, no regression below floor) | `ph37a-contract-coverage.test.cjs` |

**Measured coverage: 392 / 1,323 = 29.6%** total (the exact contract count is **1,323**; the ~1,306 quoted
in prior verdicts was an earlier approximation). Per-module coverage ranges from **P01 87.5%** down to
**G08 15.8%**. The gate now fails closed if coverage drops below **29.6% / 392 routes**, so it can only ratchet up.

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract-op coverage is now 29.6%** — measured, not eliminated. ~931 of the 1,323 contracted operations
  remain unimplemented (per-field CRUD, admin/config, report variants). The metric is **count-based**, not
  per-operation path matching; per-path reconciliation (which exact ops are missing) is the natural follow-on.
- **Deep engine depth (remaining):** G10 tax is substantially complete against FR-07 (regime, 87A, marginal
  relief, cess, Ch-VI-A, Form-12B, Form-10E/§89(1) all present); G09 POSH conciliation closed in tranche 23.
- **Persistence workstream:** the hand-built services (PH-16F..PH-37 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (now quantified):** the OpenAPI contract enumerates **1,323** operations; **392** are
implemented as behavioral kernel routes (**29.6%**).

## Recommendation for the human reviewer

Approve PH-37B, OR direct a further tranche (PH-38). The open workstreams are now: **raising measured
contract coverage** (with the ratchet gate to prove each gain, and per-path reconciliation as the next
refinement), and the **persistence migration workstream** (Postgres repos + migrations for the PH-16F..PH-37
in-memory engines; refresh the frozen `ph06-persistence` migration list at 0008). Carried debt is unchanged:
in-memory repositories for the newest services.
