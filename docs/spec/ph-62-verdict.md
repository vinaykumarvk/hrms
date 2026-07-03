# PH-62 (Remediation Tranche 49) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-61-verdict.md` (tranche 48)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **566 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-62A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. This is the **first net-new tranche** — the human reviewer directed the workstream from route-exposure
to net-new implementation. Built by hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 49 closed — a NET-NEW contracted feature (not a wiring)

| Module | Net-new operation cluster | Backing | Evidence |
|---|---|---|---|
| **G01** | FR-EPM-004 nominee register (`GET/POST /employees/{id}/nominees`, `PATCH /employees/{id}/nominees/{nomineeId}`, `POST .../{nomineeId}:remove`) | **new** `NomineeService` + `InMemoryNomineeRepository` (built this tranche): VAL-NOMINEE share invariant (ACTIVE shares per benefit_type ≤ 100 → 422), row_version optimistic locking (409), soft-delete that frees the share, per-mutation audit | `ph62a-g01-nominee-route.test.cjs` |

Unlike the 22 prior exposure tranches, this is **genuinely new implementation**: a new service module, a new
repository, a new registered error code (`VAL-NOMINEE` → 422), and new tests exercising the business rule —
not a route wired over a pre-existing engine. Measured contract coverage ratchets **552 / 41.7% → 556 / 42%**
(G01 **30.3% → 32.7%**), and the PH-37 gate floor was raised in lockstep so the gain is locked.

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 42%** — ~767 of the **1,323** contracted operations remain unimplemented. From here
  every ratchet is a **net-new implementation** (new backing + schema + tests per operation), materially
  slower than the exposure tranches; the next candidates are the other FR-EPM satellites (emergency-contacts,
  education, experience, bank accounts, positions) and equivalent net-new clusters in every module.
- **Persistence workstream:** the hand-built services (PH-16F..PH-62 engines, now including the nominee
  register) use in-memory repositories; Postgres-backed repos + migrations remain deferred; the
  `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **556** are
implemented as behavioral kernel routes (**42%**).

## Recommendation for the human reviewer

Approve PH-62B, OR direct a further tranche (PH-63). The net-new implementation workstream is now under way;
each subsequent tranche adds a real contracted feature (new backing + tests), and the ratchet gate proves and
locks every gain. Carried debt is unchanged: in-memory repositories for the newest services.
