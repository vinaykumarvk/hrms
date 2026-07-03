# PH-61 (Remediation Tranche 48) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-60-verdict.md` (tranche 47)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **563 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-61A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. Second-pass deepening tranche, into G12 + G13. Built by hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 48 closed — coverage ratcheted further with real, tested routes

| Module | Route exposure | Backing | Evidence |
|---|---|---|---|
| **G12** | SR admissibility/integrity reads (`GET /sr/subscriptions`, `GET /sr/employees/{employeeId}/attestations`, `GET /sr/attestations/{attestationId}`) | existing `srAdmissibilityService` + `srIntegrityService`, service-tested | `ph61a-g12-g13-admissibility-ocr-route.test.cjs` |
| **G13** | OCR index management (`POST /documents:ocr-index`, `GET /documents:ocr-index-list`) | existing `ocrSearchService` (index-from-payload extracts + persists), service-tested | same |

Real behavioral routes over already-tested backing — **not** scaffolding. Measured contract coverage ratchets
**547 / 41.3% → 552 / 41.7%** (G12 **53.8% → 58.5%**, G13 **31.6% → 33.3%**), and the PH-37 gate floor was
raised in lockstep so the gain is locked. (A `/documents/{id}` path collision on the OCR index list was caught
and fixed to the `:ocr-index-list` action convention — the router invariant was respected, not weakened.)

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 41.7%** — ~771 of the **1,323** contracted operations remain unimplemented. The
  coverage tool is still **count-based**, not per-operation path matching. The route-exposure vein is now
  **effectively exhausted** — the sweep across all 14 modules leaves only repository-level helpers, guards,
  and setup methods behind. The entire remaining residual requires **net-new implementation** (new service
  logic + schema + tests) or the **persistence migration**.
- **Persistence workstream:** the hand-built services (PH-16F..PH-61 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **552** are
implemented as behavioral kernel routes (**41.7%**).

## Recommendation for the human reviewer

Approve PH-61B, OR direct a further tranche (PH-62). This tranche marks the practical **end of the
route-exposure workstream** — coverage rose from 29.6% to 41.7% (392 → 552 routes) by wiring pre-existing,
already-tested engine methods with their guards intact, and the readily-exposable backing is now consumed.
Continuing toward 100% requires a **different, materially larger kind of work**: net-new implementation
(new backing + schema + acceptance tests per operation) and/or the Postgres persistence migration. This is a
natural decision point on which direction to fund next. Carried debt is unchanged: in-memory repositories.
