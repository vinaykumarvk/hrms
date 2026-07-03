# PH-42 (Remediation Tranche 29) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-41-verdict.md` (tranche 28)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **512 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-42A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. Fifth tranche of the user-directed "raise contract coverage" workstream. Built by hand — subagents
credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 29 closed — coverage ratcheted further with real, tested routes

| Module | Route exposure | Backing | Evidence |
|---|---|---|---|
| **G07** | FR-G07-018 external-credential lifecycle (`POST /training/external-credentials`, `:review-evidence`, `:verify`, `:reject`, `GET /{id}`, `.../verifications`) + vendor-empanelment (`POST /training/vendor-empanelments/{id}:review`, `:decide`, `GET /{id}`) | existing `trainingService` credential methods (SoD; VAL-G07-CREDREF duplicate ref; VERIFIED significant credential posts to G12) + `vendorEmpanelmentService` (4-eyes decide), service-tested | `ph42a-g07-credential-empanelment-route.test.cjs` |

Real behavioral routes over already-tested backing — **not** scaffolding. Measured contract coverage ratchets
**421 / 31.8% → 430 / 32.5%** (G07 **25.2% → 33.3%**), and the PH-37 gate floor was raised in lockstep so the
gain is locked.

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 32.5%** — ~893 of the **1,323** contracted operations remain unimplemented. The
  coverage tool is still **count-based**, not per-operation path matching. G07's readily-exposable backing is
  now largely wired (LMS statement ingest remains); the workstream continues into G14 (22.2%), G01, G13.
- **Persistence workstream:** the hand-built services (PH-16F..PH-42 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **430** are
implemented as behavioral kernel routes (**32.5%**).

## Recommendation for the human reviewer

Approve PH-42B, OR direct a further tranche (PH-43). The active workstream (per your steer) is raising
measured coverage by exposing real, tested backing, with the ratchet gate proving each gain and forbidding
regression; next candidates move to G14 and the other low-coverage modules. The standing **persistence
migration workstream** remains the alternative. Carried debt is unchanged: in-memory repositories for the
newest services.
