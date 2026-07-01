# HRMS Program — Executive Overview

**Prepared:** 2026-07-01 · **Status:** Complete — specification, validated data model, contracts, phased plan, and acceptance tests all delivered; reconciled to source CSVs + prototype.

## 1. What this is

A complete, build-ready specification program for a **government/public-sector Human Resource Management
System (HRMS)** covering the 14 functional areas in the *Functional Scope of Work — HRMS* (hosted at CGG
Data Centre). The specifications are authored to the standard leading global organisations expect
(Workday / SAP SuccessFactors / Oracle HCM class) and grounded on the organisation's **existing PrimeSoft
HRMS platform** so they are buildable on what already exists rather than greenfield.

## 2. The 14 modules (government codes G01–G14)

| Code | Module | Platform relationship |
|---|---|---|
| G01 | Employee Profile Management | Extends PrimeSoft Employee Master |
| G02 | Personal Details Modification Workflow | Extends master sensitive-field change (P01 workflow) |
| G03 | Attendance & Leave Management | Extends PrimeSoft Leave + Attendance |
| G04 | Leave → Digital Service Register Integration | **Net-new** (statutory) |
| G05 | Transfer, Relieving & Joining Workflow | **Net-new** (statutory) |
| G06 | Promotion, Posting & Progression | **Net-new** (seniority/DPC/MACP) |
| G07 | Training & Skill Development | Net-new / platform-native L&D |
| G08 | Performance Appraisal (APAR) | Extends PrimeSoft Performance |
| G09 | Disciplinary Cases & Punishment | **Net-new** (CCA-style due process) |
| G10 | Payroll & Benefits | Phase-2 extension |
| G11 | Retirement & Pension | **Net-new** (statutory) |
| G12 | Digital Employee Service Register (Digital SR) | **Net-new** statutory system-of-record |
| G13 | Document Management & Secure Storage | Extends PrimeSoft Documents |
| G14 | Dashboard & Analytics | Extends PrimeSoft Reports & Analytics |

The net-new statutory modules (Digital SR, pension, disciplinary, transfer/seniority, leave-SR) are the
ones a commercial HCM lacks — and even those run on the existing platform services (workflow, audit, migration).

## 3. How it was produced (rigor trail)

1. **Draft (v1):** one detailed BRD per module — full data models, low-level designs, APIs, traceability.
2. **Adversarial evaluation:** each BRD stress-tested by a 5-advisor expert council (proponent, contrarian,
   first-principles, outsider, executor → anonymous peer review → chairman synthesis). ~270 risks catalogued,
   ~300 improvements adopted.
3. **Council-revised (v2):** every adopted improvement folded in with an audit trail; High/Critical risks
   converted to concrete controls; overstated claims (e.g. "blockchain SR", false "0 gaps") corrected.
4. **Platform re-grounding (v3):** re-anchored onto the real PrimeSoft platform — P01 Workflow, P02
   RBAC/Authorization, P05 Audit, P06 Migration, X/W services, the VAL-* validation library, RBAC v1.7,
   multi-tenancy, and the platform API/error conventions — with `G01–G14` codes.
5. **Cross-module integration review + remediation (v3.1):** five integration audits found and fixed the
   seams independent authoring introduced (a single SR ingestion contract, id-namespace hygiene, no entity forks).
6. **Consolidated data model:** a 447-table PostgreSQL schema, **validated end-to-end** against a live
   PostgreSQL instance (1,907 foreign keys, 443 row-level-security tables, 700 enums, all seed data inserting).

## 4. Quality evidence

- **14 council reports** (`docs/evaluation/`) — independent adversarial review per module.
- **5 integration reviews + remediation** (`docs/review/`) — cross-module coherence, MATERIAL CONFLICTS on
  the SR contract found and resolved.
- **Schema validated end-to-end** (`docs/data-model/`) — not just per-file parsing; full cross-module FK
  integration loads clean.
- **Every BRD and report rendered to `.docx`** for distribution.

## 5. Artefact inventory

| Location | Contents |
|---|---|
| `docs/brd/v3/` | **Authoritative** 14 platform-grounded BRDs (md + docx) |
| `docs/brd/PLATFORM_FOUNDATION.md`, `MODULE_RECONCILIATION.md` | Platform build contract + gov↔PrimeSoft map |
| `docs/brd/v1/`, `docs/brd/v2/` | Draft and council-revised lineage |
| `docs/evaluation/` | 14 adversarial council reports |
| `docs/review/` | 5 integration reviews + remediation spec |
| `docs/data-model/` | 447-table validated PostgreSQL schema (core + 14 modules) |
| `docs/platform-grounding/` | Extracted PrimeSoft governing-document text |
| `docs/tools/md2docx.py` | Markdown → styled .docx renderer |

## 6. Build-pipeline artefacts (delivered)

All downstream artefacts have now been produced and are in the repo:

- **Architecture document** (`docs/architecture.md`) — 14 modules on the platform + 11 ADRs.
- **Machine-readable contracts** (`docs/contracts/`) — OpenAPI 3.1 for all 14 modules (**1,132 paths /
  1,306 operations**), `auth-matrix.yaml` (76 roles), `error-taxonomy.yaml` (311 codes),
  `state-machines.yaml` (73 machines), `dependency-register.yaml`.
- **Acceptance & E2E test suites** (`docs/tests/`) — **1,597 test cases**, every FR covered (0 gaps).
- **Dependency-ordered phased build plan** (`docs/phased-plan.md`).
- **Field reconciliation** (`docs/data-model/reconciliation/`) — the schema and BRDs were reconciled against
  the 116 Darwinbox CSV field exports and the 296-screen prototype; data model grew **403 → 447 tables**;
  BRDs synced to **v3.2**; OpenAPI + tests refreshed for the changed modules.

## 7. Recommended build sequence

From the schema dependencies: platform core → G01/G12/G13 (foundational systems of record) → G02/G03 →
G04/G05/G06/G08/G09 → G10/G11 → G14.
