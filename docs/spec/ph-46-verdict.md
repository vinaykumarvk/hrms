# PH-46 (Remediation Tranche 33) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-45-verdict.md` (tranche 32)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **524 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-46A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. Ninth tranche of the user-directed "raise contract coverage" workstream, moving into G10. Built by
hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 33 closed — coverage ratcheted further with real, tested routes

| Module | Route exposure | Backing | Evidence |
|---|---|---|---|
| **G10** | FR-G10-08 loan lifecycle (`POST /payroll/loans/{id}:instalment`, `:foreclose`, `GET /payroll/loans/{id}/repayments`, `GET /payroll/employees/{employeeId}/carryforwards`) + Rule-3 concessional perquisite valuation (`POST /payroll/perquisites:value`) | existing `loanPerquisiteGlService` (net-floor cap + ERR-G10-RECOVERY-NET carryforward; ACTIVE-only foreclose; ERR-G10-PERQ-REFRATE on missing reference rate; integer paise throughout), service-tested | `ph46a-g10-loan-perquisite-route.test.cjs` |

Real behavioral routes over already-tested backing — **not** scaffolding. Measured contract coverage ratchets
**451 / 34.1% → 456 / 34.5%** (G10 **28.7% → 34.5%**), and the PH-37 gate floor was raised in lockstep so the
gain is locked.

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 34.5%** — ~867 of the **1,323** contracted operations remain unimplemented. The
  coverage tool is still **count-based**, not per-operation path matching. G10 has more unexposed backing
  (recovery-demand scheduling, FnF settlement, engine-run lifecycle, arrears); the workstream continues there
  and into **G11 (30%)**.
- **Persistence workstream:** the hand-built services (PH-16F..PH-46 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **456** are
implemented as behavioral kernel routes (**34.5%**).

## Recommendation for the human reviewer

Approve PH-46B, OR direct a further tranche (PH-47). The active workstream (per your steer) is raising
measured coverage by exposing real, tested backing, with the ratchet gate proving each gain and forbidding
regression; next candidates move to more G10 (recovery/FnF/arrears) and G11. The standing **persistence
migration workstream** remains the alternative. Carried debt is unchanged: in-memory repositories for the
newest services.
