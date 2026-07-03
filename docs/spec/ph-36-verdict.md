# PH-36 (Remediation Tranche 23) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-35-verdict.md` (tranche 22)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **495 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **133 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

The PH-36A oracle was run **externally** by the driver and is GREEN. This tranche is a **deep-engine depth**
slice — the first of the remaining deep-engine workstream named by tranche 22. Built by hand — subagents
credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 23 closed — G09 POSH conciliation (FR-G09-023 BR-2)

| Module | Deep-engine gap closed | Evidence |
|---|---|---|
| **G09** | POSH conciliation (POSH Act 2013 s.10 / FR-G09-023 BR-2): the aggrieved complainant may opt for conciliation **before** the inquiry; a SETTLED conciliation **blocks** the inquiry report; a conciliation may **not** rest on a monetary settlement (`ERR-G09-CONCILIATION-MONETARY`, 422). Routes `POST /api/v1/disciplinary/cases/{id}:conciliation` + `GET .../conciliations`. | `ph36a-g09-posh-conciliation-route.test.cjs` |

`recordConciliation` is guarded (POSH-only, opted-by-complainant, before-inquiry, non-monetary), audited,
and P02-scoped; the SETTLED-blocks-inquiry rule is enforced in `recordInquiryReport`. This closes one of the
three named deep-engine items; **G10 TDS/Form-16 depth and G04 CI conformance remain open** (below).

## Remaining gaps (still open — this is NOT a 100% claim)

- **Deep engine depth (remaining):** G10 remaining TDS edge cases + Form-16 Part-A remittance-matching
  depth; G04 CI port-conformance gate in the build pipeline. (G09 POSH conciliation is now closed; the
  broader G09 POSH inquiry-conduct depth beyond conciliation is not separately claimed.)
- **Persistence workstream:** the hand-built services (PH-16F..PH-36 engines, now including the POSH
  conciliation register) use in-memory repositories; Postgres-backed repos + migrations remain deferred,
  and the `ph06-persistence` migration-list assertion froze at 0008.

**Contract-op coverage caveat:** implemented routes still cover only a fraction of the **1,306** OpenAPI
operations — the contract enumerates far more operations (per-field CRUD, admin/config, report variants)
than the core behavioral routes shipped.

## Recommendation for the human reviewer

Approve PH-36B, OR direct a further tranche (PH-37). With G09 POSH conciliation closed, the open
deep-engine items narrow to **G10 TDS/Form-16 depth** and the **G04 CI conformance gate**, alongside the
standing **persistence migration workstream** (Postgres repos + migrations for the PH-16F..PH-36 in-memory
engines; refresh the frozen `ph06-persistence` migration list at 0008). Carried debt is unchanged:
in-memory repositories for the newest services, including this tranche's conciliation register.
