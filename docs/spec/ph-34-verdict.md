# PH-34 (Remediation Tranche 21) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-33-verdict.md` (tranche 20)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **488 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail (+6 this tranche).
- `npm run typecheck` / `npm run web:typecheck`: green.

All three PH-34A..C oracles were run **externally** by the driver and are GREEN — the three remaining
UI surfaces. Built by hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 21 closed — the named UI-surface backlog is now cleared

| Module | UI surface | Evidence |
|---|---|---|
| **G14** | embedded BI dashboard — KPI board with a mobile/desktop viewport toggle | `ph34a-g14-embedded-bi.test.cjs` |
| **G06** | sealed-cover review console — list + release form (mandatory reason) | `ph34b-g06-sealed-cover.test.cjs` |
| **G01** | privacy / DPDP self-service console — rights-request list + raise form | `ph34c-g01-privacy-console.test.cjs` |

Each is a real controlled surface using the injected `HrmsClient` with canonical loading/error/empty
states, mounted in `App.tsx`, and tested. As with the earlier UI tranches, the web suite exercises them
against the in-memory `fixtureHrmsClient`; the real `createHrmsClient` methods point at the intended API
routes (`/api/v1/analytics/bi-kpis`, `/api/v1/promotions/sealed-covers`, `/api/v1/me/rights-requests`),
whose backend route exposure is a paired follow-on (recorded below).

## Remaining gaps (still open — this is NOT a 100% claim)

The residual is now down to a short, specific list:

- **Route exposure for the three new UI surfaces** (BI-KPIs, sealed-cover release, self-service rights).
- **Deep engine depth:** G10 remaining TDS edge cases + Form-16 Part-A remittance matching depth;
  G09 POSH conciliation depth; G04 CI port-conformance gate in the build pipeline.
- **Persistence workstream:** the newest hand-built services (PH-16F..PH-34 engines) use in-memory
  repositories; Postgres-backed repos + migrations for these remain deferred, and the `ph06-persistence`
  migration-list assertion froze at 0008.

**Contract-op coverage caveat:** implemented routes still cover only a fraction of the **1,306** OpenAPI
operations — the contract enumerates far more operations (per-field CRUD, admin/config, report variants)
than the core behavioral routes shipped.

## Recommendation for the human reviewer

Approve PH-34D, OR direct a further tranche (PH-35). With the named UI-surface backlog cleared, the open
workstreams are: route-exposure for the three new UI surfaces, the deep-engine items, and the persistence
migration workstream. Carried debt (unchanged): in-memory repositories for the newest services; the
`ph06-persistence` migration-list assertion froze at 0008.
