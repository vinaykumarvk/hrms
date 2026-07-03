# PH-40 (Remediation Tranche 27) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-39-verdict.md` (tranche 26)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **506 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-40A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. Third tranche of the user-directed "raise contract coverage" workstream. Built by hand — subagents
credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 27 closed — coverage ratcheted further with real, tested routes

| Module | Route exposure | Backing | Evidence |
|---|---|---|---|
| **G08** | continuous-feedback (`POST /continuous-feedback/check-ins`, `GET /continuous-feedback`, `GET /continuous-feedback/check-ins`), 360-feedback (`POST /360-feedback/{id}:rate`, `:release`, `GET /360-feedback/{id}`), signatures (`GET /apar/forms/{id}/signatures`) | existing `continuousFeedbackService`, `feedback360Service` (MIN_RATERS + self-rating + score guards), `digitalSignatureService` — all service-tested | `ph40a-g08-feedback-signature-route.test.cjs` |

Real behavioral routes over already-tested backing — **not** scaffolding. Measured contract coverage ratchets
**404 / 30.5% → 411 / 31.1%** (G08 **24.8% → 30.1%** — G08 has now crossed 30%), and the PH-37 gate floor was
raised in lockstep so the gain is locked. A `requiredQuery` body helper was added for filtered list endpoints.

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 31.1%** — ~912 of the **1,323** contracted operations remain unimplemented. The
  coverage tool is still **count-based**, not per-operation path matching. G08's readily-exposable backing is
  now largely wired; the workstream continues into the low-coverage modules **G07 (16.2%)**, G14, G01, G13.
- **Persistence workstream:** the hand-built services (PH-16F..PH-40 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **411** are
implemented as behavioral kernel routes (**31.1%**).

## Recommendation for the human reviewer

Approve PH-40B, OR direct a further tranche (PH-41). The active workstream (per your steer) is raising
measured coverage by exposing real, tested backing, with the ratchet gate proving each gain and forbidding
regression; next candidates move to G07 and the other low-coverage modules. The standing **persistence
migration workstream** remains the alternative. Carried debt is unchanged: in-memory repositories for the
newest services.
