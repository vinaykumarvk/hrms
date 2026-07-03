# PH-27 (Remediation Tranche 14) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-26-verdict.md` (tranche 13)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **456 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **127 pass**, 0 fail (+6 this tranche).
- `npm run typecheck` / `npm run web:typecheck`: green.

All three PH-27A..C oracles were run **externally** by the driver and are GREEN. This tranche pivoted
to **web UI surfaces**: each oracle asserts a real controlled surface (form/handler + useState +
injected-client call + canonical loading/error/empty states), the client + fixture expose the method,
the surface is mounted in `App.tsx`, and all four suites are green. Built by hand — subagents remain
credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** A GREEN oracle means the surface is built, wired, and
> tested; it does NOT mean the BRDs are complete. This gate requires a human review before advancing.

## What tranche 14 closed (delta vs the 2026-07-03 baseline)

| Module | Closed in PH-27 | Evidence |
|---|---|---|
| **G13** | DPDP data-subject-request console UI — lists data_subject_requests + adjudicate form (FULFILLED/EXEMPTED/REJECTED, mandatory reason), wired to the PH-15E DSR engine | `ph27a-g13-dsr-console.test.cjs` |
| **G05** | interactive counselling console UI — session turn view + choose-vacancy form, wired to the PH-16D counselling engine | `ph27b-g05-counselling.test.cjs` |
| **G09** | evidence-vault listing UI — case evidence list with WORM / legal-hold / served flags | `ph27c-g09-evidence-vault.test.cjs` |

## Honest UI caveat

These surfaces are wired to the injected `HrmsClient`; the web suite exercises them against the
in-memory `fixtureHrmsClient` (the established PH-05x pattern). The real `createHrmsClient` methods
point at the intended API routes (`/api/v1/dsr`, `/api/v1/transfers/counselling`,
`/api/v1/disciplinary/cases/{id}/evidence`); **exposing those API routes over the existing PH-15E/
PH-16D/G09 services is the paired backend task** and is recorded as an open item below.

## Remaining gaps (still open — this is NOT a 100% claim)

- **Route exposure** for the three PH-27 UI surfaces (DSR / counselling / case-evidence endpoints).
- **G01**: privacy/DPDP console UI.
- **G02**: additional fraud/velocity detectors.
- **G03**: backdated-leave team-calendar conflict threshold.
- **G04**: CI port-conformance gate in the build pipeline.
- **G06**: sealed-cover full workflow UI.
- **G07**: content/assessment-item bank.
- **G08**: calibration analytics depth.
- **G09**: POSH conciliation depth.
- **G10**: remaining TDS edge cases, Form-16 Part-A remittance matching depth.
- **G14**: embedded BI dashboards, mobile briefing.

**Contract-op coverage caveat:** implemented routes still cover only a small fraction of the **1,306**
OpenAPI operations frozen in `docs/contracts/openapi/*.yaml`.

## Recommendation for the human reviewer

Approve PH-27D, OR direct a further tranche (PH-28). The natural next step is a **route-exposure
tranche** that wires the PH-15E/PH-16D/G09 (and other in-memory) services onto real `/api/v1` route
handlers so the UI surfaces run end-to-end, followed by the remaining UI surfaces. Carried debts
(unchanged): the newest hand-built services (PH-16F..PH-26) use in-memory repositories only; the
`ph06-persistence` migration-list assertion froze at 0008.
