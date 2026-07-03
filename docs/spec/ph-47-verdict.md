# PH-47 (Remediation Tranche 34) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-46-verdict.md` (tranche 33)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **527 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-47A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. Tenth tranche of the user-directed "raise contract coverage" workstream, moving into G11. Built by
hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 34 closed — coverage ratcheted further with real, tested routes

| Module | Route exposure | Backing | Evidence |
|---|---|---|---|
| **G11** | PDA go-live lifecycle (`POST /pension/pdas/{id}:certify-sandbox`, `:activate`, `GET /pension/pdas/{id}`), grievance close (`POST /pension/grievances/{id}:close`), pensioner bank-account verification (`POST /pension/account-verifications`, `GET /pension/cases/{caseId}/account-verifications`) | existing `pensionTreasuryService` (uncertified-cannot-activate go-live gate) + `pensionDisbursementService` (method/result validation; supersede prior ACTIVE verification), service-tested | `ph47a-g11-pda-verification-route.test.cjs` |

Real behavioral routes over already-tested backing — **not** scaffolding. Measured contract coverage ratchets
**456 / 34.5% → 462 / 34.9%** (G11 **30% → 36.7%**), and the PH-37 gate floor was raised in lockstep so the
gain is locked.

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 34.9%** — ~861 of the **1,323** contracted operations remain unimplemented. The
  coverage tool is still **count-based**, not per-operation path matching. G11 has more unexposed backing
  (disbursement batches, benefit revisions, overpayment recovery, digital delivery); the workstream continues
  there and into **G12 (43.1%)**, G05, G03, G02.
- **Persistence workstream:** the hand-built services (PH-16F..PH-47 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **462** are
implemented as behavioral kernel routes (**34.9%**).

## Recommendation for the human reviewer

Approve PH-47B, OR direct a further tranche (PH-48). The active workstream (per your steer) is raising
measured coverage by exposing real, tested backing, with the ratchet gate proving each gain and forbidding
regression; next candidates move to more G11 and G12/G05. The standing **persistence migration workstream**
remains the alternative. Carried debt is unchanged: in-memory repositories for the newest services.
