# HRMS — Business Requirements Documentation Program

Source: **Functional Scope of Work — HRMS** (`~/Downloads/Functional Scope of Work - HRMS.pdf`), Section 7,
14 functional line items. Application software development, technical support & maintenance, hosting at CGG Data Centre.

> **Update (2026-07-01) — Platform re-grounding (v3).** After the first three phases, the existing
> **PrimeSoft HRMS** platform deliverables (`docs/HRMS Deliverables to Development Phase/`) were taken
> into account. The 14 BRDs were re-grounded onto that real platform — consuming its services
> (P01 Workflow, P02 RBAC/Authorization, P03 Chat, P04 Tenant/Org Admin, P05 Audit, P06 Migration,
> X.1–X.3, W.1–W.3), `VAL-*` validation library, RBAC v1.7, multi-tenancy (`tenant_id`/`entity_id`),
> and `/api/v1` conventions instead of an invented foundation. The **authoritative set is now `docs/brd/v3/`**
> (government module codes `G01–G14`). See [`brd/PLATFORM_FOUNDATION.md`](brd/PLATFORM_FOUNDATION.md)
> and [`brd/MODULE_RECONCILIATION.md`](brd/MODULE_RECONCILIATION.md).

This documentation set was produced in **three phases plus a platform re-grounding pass**, per the program goal:

1. **Phase 1 — Draft BRDs (v1):** One detailed, AI-buildable BRD per line item, authored to world-class
   global-enterprise HR/HCM standards (Workday / SuccessFactors / Oracle HCM class) layered on the
   public-sector statutory context, using the `brd-generator` 16-section structure.
2. **Phase 2 — Adversarial evaluation:** Each v1 BRD was stress-tested by a 5-advisor expert council
   (`adversarial-idea-evaluator`: Proponent, Contrarian, First-Principles, Outsider, Executor → anonymous
   peer review → chairman synthesis), producing a risk register and an "Adopted Improvements for BRD v2" list.
3. **Phase 3 — Revised BRDs (v2):** Each BRD was re-generated incorporating its council's adopted
   improvements, with a `## Amendments (v1 → v2)` audit trail mapping every council idea to its landing FR /
   entity / section, and High/Critical risks converted into concrete requirements and controls.
4. **Phase 4 — Platform re-grounding (v3, authoritative):** Each v2 BRD was re-anchored onto the existing
   PrimeSoft platform — adopting P01–P06 / X / W services, `VAL-*`, RBAC v1.7, multi-tenancy, and the
   platform API/error conventions; correcting invented error codes, roles, audit/workflow engines, and the
   missing tenancy model; adopting `G01–G14` module codes; and adding an `## Alignment with PrimeSoft Platform`
   FR→service map plus an `## Amendments (v2 → v3)` audit trail. Net-new statutory engines (Digital SR ledger,
   pension, disciplinary due-process, qualifying-service, transfer/seniority) are the only things authored
   from scratch — and even those run on P01/P05/P06.

## Scale of the deliverable

- **14 modules × 3 artefacts (v1 BRD, council report, v2 BRD) = 42 documents**, each in Markdown **and** styled `.docx`.
- v2 BRDs total **~405,000 words / ~316 functional requirements**, each with full Low-Level Design tables,
  holistic data models with sample data, error-code catalogs, state machines, traceability, and 0-gap reconciliation.
- ~300 council-adopted improvements folded across the suite; ~270 risks catalogued.

## Shared build contract

All 14 BRDs are mutually consistent against [`brd/SHARED_FOUNDATION.md`](brd/SHARED_FOUNDATION.md) — one
canonical Employee master, one Digital SR ledger, one document service, shared roles, conventions, API error
envelope, and technical defaults — so the modules compose into a single coherent HRMS rather than 14 silos.

## Module index

| # | Module | v1 BRD | Council report | v2 BRD |
|---|---|---|---|---|
| 01 | Employee Profile Management | `brd/v1/M01-…` | `evaluation/M01-…-council` | `brd/v2/M01-…` |
| 02 | Employee Personal Details Modification Workflow | `…M02-…` | `…M02-…-council` | `…M02-…` |
| 03 | Attendance and Leave Management | `…M03-…` | `…M03-…-council` | `…M03-…` |
| 04 | Leave Management Integration with Digital SR | `…M04-…` | `…M04-…-council` | `…M04-…` |
| 05 | Employee Transfer, Relieving and Joining Workflow | `…M05-…` | `…M05-…-council` | `…M05-…` |
| 06 | Promotion, Posting & Progression Monitoring | `…M06-…` | `…M06-…-council` | `…M06-…` |
| 07 | Training and Skill Development Management | `…M07-…` | `…M07-…-council` | `…M07-…` |
| 08 | Performance Appraisal Management | `…M08-…` | `…M08-…-council` | `…M08-…` |
| 09 | Employee Disciplinary Cases and Punishment Management | `…M09-…` | `…M09-…-council` | `…M09-…` |
| 10 | Payroll and Benefits Management | `…M10-…` | `…M10-…-council` | `…M10-…` |
| 11 | Retirement and Pension Management | `…M11-…` | `…M11-…-council` | `…M11-…` |
| 12 | Digital Employee Service Register (Digital SR) | `…M12-…` | `…M12-…-council` | `…M12-…` |
| 13 | Document Management and Secure Storage | `…M13-…` | `…M13-…-council` | `…M13-…` |
| 14 | Dashboard and Analytics | `…M14-…` | `…M14-…-council` | `…M14-…` |

## Folder layout

```
docs/
├── README.md                          ← this file
├── HRMS Deliverables to Development Phase/  ← existing PrimeSoft platform deliverables (upstream)
├── platform-grounding/extracts/       ← extracted text of the governing PrimeSoft docs
├── brd/
│   ├── PLATFORM_FOUNDATION.md          ← authoritative build contract (the REAL platform) — read first
│   ├── MODULE_RECONCILIATION.md        ← government G01–G14 ↔ PrimeSoft map + convention overrides
│   ├── SHARED_FOUNDATION.md            ← original invented brief (conventions SUPERSEDED; module list still valid)
│   ├── v1/  *.md + docx/*.docx         ← Phase 1: 14 draft BRDs
│   ├── v2/  *.md + docx/*.docx         ← Phase 3: 14 council-revised BRDs
│   └── v3/  *.md + docx/*.docx         ← Phase 4: 14 platform-grounded BRDs (CURRENT, AUTHORITATIVE)
├── evaluation/  *.md + docx/*.docx     ← Phase 2: 14 council reports
└── tools/md2docx.py                    ← Markdown → styled .docx converter
```

### Downstream build-pipeline artefacts (Phase 4)
- `architecture.md` — system architecture + 11 ADRs (build-on-PrimeSoft, SR-on-P05, RLS-as-P02, …).
- `contracts/` — machine-readable contracts: **OpenAPI 3.1** (`openapi/G01–G14.yaml`, 1,182 operations),
  `auth-matrix.yaml`, `error-taxonomy.yaml` (311 codes), `state-machines.yaml` (73 machines),
  `dependency-register.yaml`. See `contracts/README.md`.
- `data-model/` — validated 403-table PostgreSQL schema (core + 14 modules). See `data-model/README.md`.
- `phased-plan.md` — dependency-ordered build plan (Phase 0 core → G01/G12/G13 → G02/G03 → SR writers → G10/G11 → G14).
- `tests/` — **1,530 acceptance & E2E test cases** across 14 modules (every FR covered, 0 gaps), asserted
  against the contracts. See `tests/README.md`.
- `review/` — cross-module consistency review + remediation.

**Authoritative set for build:** `docs/brd/v3/` (codes `G01–G14`), read together with
`docs/brd/PLATFORM_FOUNDATION.md` and `docs/brd/MODULE_RECONCILIATION.md`. The full decision trail for any
module = its v3 `Alignment with PrimeSoft Platform` + `Amendments (v2 → v3)` sections → its v2
`Amendments (v1 → v2)` → its `docs/evaluation/` council report → its v1 draft.
