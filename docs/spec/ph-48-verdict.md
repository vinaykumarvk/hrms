# PH-48 (Remediation Tranche 35) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-47-verdict.md` (tranche 34)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **530 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-48A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. Eleventh tranche of the user-directed "raise contract coverage" workstream, moving into G12. Built by
hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 35 closed — coverage ratcheted further with real, tested routes

| Module | Route exposure | Backing | Evidence |
|---|---|---|---|
| **G12** | SR-ledger chain reads (`GET /sr/employees/{id}/entry-chain`, `/status-chain`, `/status-events`, `GET /sr/chain-employees`, `/sr/feed-events`) + RFC-3161 timestamp verify (`POST /sr/timestamp:verify`) + offline-bundle verify (`POST /sr/verification-bundle:verify`) | existing `serviceRegisterService` chain queries + `timestampAuthorityService.verifyTimestamp` + `offlineVerificationService.verifyBundle` (verify round-trips against the issue routes; tamper → valid:false), service-tested | `ph48a-g12-chain-verify-route.test.cjs` |

Real behavioral routes over already-tested backing — **not** scaffolding. Measured contract coverage ratchets
**462 / 34.9% → 469 / 35.4%** (G12 **43.1% → 53.8%** — G12 has now crossed 50%), and the PH-37 gate floor was
raised in lockstep so the gain is locked.

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 35.4%** — ~854 of the **1,323** contracted operations remain unimplemented. The
  coverage tool is still **count-based**, not per-operation path matching. The workstream continues into the
  remaining lower-coverage modules **G02 (38.5%)**, G03 (40.2%), G05, G04, G06, G09.
- **Persistence workstream:** the hand-built services (PH-16F..PH-48 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **469** are
implemented as behavioral kernel routes (**35.4%**).

## Recommendation for the human reviewer

Approve PH-48B, OR direct a further tranche (PH-49). The active workstream (per your steer) is raising
measured coverage by exposing real, tested backing, with the ratchet gate proving each gain and forbidding
regression; next candidates move to G02/G03/G05. The standing **persistence migration workstream** remains
the alternative. Carried debt is unchanged: in-memory repositories for the newest services.
