# PH-35 (Remediation Tranche 22) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-34-verdict.md` (tranche 21)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **492 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

All three PH-35A..C oracles were run **externally** by the driver and are GREEN. This tranche is the
**route-exposure follow-on** for the three UI surfaces landed in tranche 21 (PH-34A..C): the UI methods
in `createHrmsClient` now point at backend routes that actually exist and dispatch through the kernel.
Built by hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 22 closed — route exposure for the tranche-21 UI surfaces

| Module | Route exposed | Backing | Evidence |
|---|---|---|---|
| **G14** | `GET /api/v1/analytics/bi-kpis` — embedded-BI KPI tiles | `analytics.listBiKpis(scope)` maps real analytics cards → tiles | `ph35a-*.test.cjs` |
| **G01** | `GET`/`POST /api/v1/me/rights-requests` — DPDP self-service | DSR-backed via `documentVault.listDataSubjectRequests`/`registerDataSubjectRequest`, subject-filtered to the signed-in actor | `ph35b-*.test.cjs` |
| **G06** | `GET`/`POST /api/v1/promotions/sealed-covers` + `POST .../{id}:release` | new `SealedCoverService` (place / list / release-with-mandatory-reason), P02-scoped, audited | `ph35c-g06-sealed-cover-route.test.cjs` |

With this tranche the three tranche-21 UI surfaces are no longer pointing at unbacked routes — each has a
real kernel route registered, permission-guarded, and exercised by an API test that dispatches through
`createFoundationApi`. The **named UI-surface backlog and its route exposure are now both cleared.**

## Remaining gaps (still open — this is NOT a 100% claim)

The residual is unchanged in shape from tranche 21 minus the route-exposure item now closed:

- **Deep engine depth:** G10 remaining TDS edge cases + Form-16 Part-A remittance-matching depth;
  G09 POSH conciliation depth; G04 CI port-conformance gate in the build pipeline.
- **Persistence workstream:** the hand-built services (PH-16F..PH-35 engines, now including
  `SealedCoverService`) use in-memory repositories; Postgres-backed repos + migrations for these remain
  deferred, and the `ph06-persistence` migration-list assertion froze at 0008.

**Contract-op coverage caveat:** implemented routes still cover only a fraction of the **1,306** OpenAPI
operations — the contract enumerates far more operations (per-field CRUD, admin/config, report variants)
than the core behavioral routes shipped.

## Recommendation for the human reviewer

Approve PH-35D, OR direct a further tranche (PH-36). With the UI-surface backlog and its route exposure
both cleared, the two open workstreams are now the **deep-engine depth items** (G10 TDS/Form-16, G09 POSH,
G04 CI conformance) and the **persistence migration workstream** (Postgres repos + migrations for the
PH-16F..PH-35 in-memory engines; refresh the frozen `ph06-persistence` migration list at 0008). Carried
debt is unchanged: in-memory repositories for the newest services, including this tranche's sealed-cover
register.
