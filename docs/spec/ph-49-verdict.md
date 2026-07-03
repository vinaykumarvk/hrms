# PH-49 (Remediation Tranche 36) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-48-verdict.md` (tranche 35)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **532 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-49A oracle (and the PH-37A gate at its raised floor) were run **externally** by the driver and are
GREEN. Twelfth tranche of the user-directed "raise contract coverage" workstream, moving into G02. Built by
hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 36 closed — coverage ratcheted further with real, tested routes

| Module | Route exposure | Backing | Evidence |
|---|---|---|---|
| **G02** | step-up MFA lifecycle (`POST /change-requests/{id}:challenge-stepup`, `POST /change-requests/stepups/{stepUpId}:verify`, `GET /change-requests/{id}/esignatures`) + change-request template management (`GET /change-request-templates`, `POST /change-request-templates/{id}:deactivate`, `:start`) | existing `changeEsignStepUpService` (expiry → ERR-G02-STEPUP fail-closed) + `changeRequestTemplateService`, service-tested | `ph49a-g02-stepup-template-route.test.cjs` |

Real behavioral routes over already-tested backing — **not** scaffolding. Measured contract coverage ratchets
**469 / 35.4% → 475 / 35.9%** (G02 **38.5% → 47.7%**), and the PH-37 gate floor was raised in lockstep so the
gain is locked. (`latestVerifiedStepUp` is a repository-only method, not a service method, so it was not
routed — a real distinction caught during implementation, not papered over.)

## Remaining gaps (still open — this is NOT a 100% claim)

- **Contract coverage is 35.9%** — ~848 of the **1,323** contracted operations remain unimplemented. The
  coverage tool is still **count-based**, not per-operation path matching. The workstream continues into the
  remaining lower-coverage modules **G03 (40.2%)**, G05, G04, G06, G09.
- **Persistence workstream:** the hand-built services (PH-16F..PH-49 engines) use in-memory repositories;
  Postgres-backed repos + migrations remain deferred; the `ph06-persistence` migration list froze at 0008.

**Contract-op caveat (quantified):** the OpenAPI contract enumerates **1,323** operations; **475** are
implemented as behavioral kernel routes (**35.9%**).

## Recommendation for the human reviewer

Approve PH-49B, OR direct a further tranche (PH-50). The active workstream (per your steer) is raising
measured coverage by exposing real, tested backing, with the ratchet gate proving each gain and forbidding
regression; next candidates move to G03/G05/G04. The standing **persistence migration workstream** remains
the alternative. Carried debt is unchanged: in-memory repositories for the newest services.
