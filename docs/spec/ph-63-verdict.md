# PH-63 (Remediation Tranche 50) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-62-verdict.md` (tranche 49)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **569 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-63A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. Second net-new tranche, and the **50th remediation tranche** of this workstream. Built by hand —
subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 50 closed — a NET-NEW contracted feature (not a wiring)

| Module | Net-new operation cluster | Backing | Evidence |
|---|---|---|---|
| **G01** | FR-EPM-005 emergency-contact register (`GET/POST /employees/{id}/emergency-contacts`, `PATCH /employees/{id}/emergency-contacts/{contactId}`, `POST .../{contactId}:remove`) | **new** `EmergencyContactService` + `InMemoryEmergencyContactRepository` (built this tranche): unique call-order priority invariant (duplicate priority → CONFLICT 409; list sorted by priority), row_version optimistic locking (409), soft-delete that frees the priority, per-mutation audit | `ph63a-g01-emergency-contact-route.test.cjs` |

Genuinely new implementation: a new service module + repository, real business logic (the priority invariant,
optimistic lock, and share-freeing soft-delete all actually work and are tested) — not a route wired over a
pre-existing engine. Measured contract coverage ratchets **556 / 42% → 560 / 42.3%** (G01 **32.7% → 35.2%**),
and the PH-37 gate floor was raised in lockstep so the gain is locked.

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 42.3%** — ~763 of the **1,323** contracted operations remain unimplemented. From
  here every ratchet is a **net-new implementation** (new backing + schema + tests per operation). Next
  candidates: the remaining FR-EPM satellites (education, experience, bank accounts, positions/assignments)
  and equivalent net-new clusters in every module.
- **Persistence workstream:** the hand-built services (PH-16F..PH-63 engines, now including the nominee and
  emergency-contact registers) use in-memory repositories; Postgres-backed repos + migrations remain
  deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **560** are
implemented as behavioral kernel routes (**42.3%**).

## Recommendation for the human reviewer

Approve PH-63B, OR direct a further tranche (PH-64). The net-new implementation workstream continues; each
tranche adds a real contracted feature (new backing + tests), and the ratchet gate proves and locks every
gain. Carried debt is unchanged: in-memory repositories for the newest services.
