# PH-45 (Remediation Tranche 32) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-44-verdict.md` (tranche 31)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **521 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-45A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. Eighth tranche of the user-directed "raise contract coverage" workstream, moving into G01. Built by
hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 32 closed — coverage ratcheted further with real, tested routes

| Module | Route exposure | Backing | Evidence |
|---|---|---|---|
| **G01** | Aadhaar reveal 4-eyes lifecycle (`POST /employees/aadhaar-vault/{vaultId}:request-reveal`, `/employees/aadhaar-reveals/{revealId}:approve`, `GET /employees/{id}/aadhaar-vault`), employee legal-hold + blocking-obligation (`POST /employees/{id}:place-legal-hold`, `/legal-holds/{holdId}:release`, `/employees/{id}:register-obligation`, `/obligations/{obligationId}:clear`), and `GET /employees:by-service-no` | existing `aadhaarVaultService` (requester≠approver reveal guard) + `identityOpsService` (ACTIVE-only release) + `employeeMasterService.getByServiceNo`, service-tested | `ph45a-g01-aadhaar-legalhold-route.test.cjs` |

Real behavioral routes over already-tested backing — **not** scaffolding. Measured contract coverage ratchets
**443 / 33.5% → 451 / 34.1%** (G01 **21.8% → 26.7%**), and the PH-37 gate floor was raised in lockstep so the
gain is locked.

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 34.1%** — ~872 of the **1,323** contracted operations remain unimplemented. The
  coverage tool is still **count-based**, not per-operation path matching. The workstream continues into the
  remaining low-coverage modules **G10 (28.7%)**, G11 (30%), and back into G01's deeper surface.
- **Persistence workstream:** the hand-built services (PH-16F..PH-45 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **451** are
implemented as behavioral kernel routes (**34.1%**).

## Recommendation for the human reviewer

Approve PH-45B, OR direct a further tranche (PH-46). The active workstream (per your steer) is raising
measured coverage by exposing real, tested backing, with the ratchet gate proving each gain and forbidding
regression; next candidates move to G10/G11. The standing **persistence migration workstream** remains the
alternative. Carried debt is unchanged: in-memory repositories for the newest services.
