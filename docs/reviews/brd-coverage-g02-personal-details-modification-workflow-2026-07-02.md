# BRD Coverage Review — G02 Personal Details Modification Workflow

Date: 2026-07-02
BRD under review: `docs/brd/v3/G02-personal-details-modification-workflow.md`
Verdict: **FAIL — useful workflow spine implemented, full BRD not yet implemented**

## Scope

The G02 BRD defines 23 functional requirements from `FR-G02-001` through `FR-G02-023` (`docs/brd/v3/G02-personal-details-modification-workflow.md:983`, `docs/brd/v3/G02-personal-details-modification-workflow.md:2300`). It positions G02 as the governed change-control layer in front of G01, using P01 for workflow, P02 for authorization, P05 for audit, G13 for evidence, and G01/G12 for statutory Service Register posting ownership (`docs/brd/v3/G02-personal-details-modification-workflow.md:27`, `docs/brd/v3/G02-personal-details-modification-workflow.md:34`).

## Evidence Base

Executable implementation found:

- Single backend service file: `apps/api/src/modules/g02/personalDetailsService.ts` from `find apps/api/src/modules/g02 apps/web/src/modules/g02 -type f`.
- Single web module file: `apps/web/src/modules/g02/PersonalDetailsWorkspace.tsx`.
- Routes are limited to create, list, approve, reject, commit, and reverse in `apps/api/src/routes/g02.routes.ts:14` through `apps/api/src/routes/g02.routes.ts:94`.
- Service supports a simplified request model with `displayName`, `pan`, and `aadhaarMasked` as field codes (`apps/api/src/modules/g02/personalDetailsService.ts:9`), only five statuses (`apps/api/src/modules/g02/personalDetailsService.ts:10`), P01 workflow start (`apps/api/src/modules/g02/personalDetailsService.ts:60`), optional G13 evidence document creation (`apps/api/src/modules/g02/personalDetailsService.ts:189`), display-name-only commit to G01 (`apps/api/src/modules/g02/personalDetailsService.ts:128`, `apps/api/src/modules/g02/personalDetailsService.ts:135`), and simplified reversal (`apps/api/src/modules/g02/personalDetailsService.ts:161`).
- Tests cover sensitivity/evidence, display-name commit/reversal via G01, and API happy path (`apps/api/test/ph07-g02-personal-details.test.cjs:32`, `apps/api/test/ph07-g02-personal-details.test.cjs:47`, `apps/api/test/ph07-g02-personal-details.test.cjs:74`).
- Web UI is an evidence panel showing request number, field, routing, SR owner, G13 document count, and G01 ownership (`apps/web/src/modules/g02/PersonalDetailsWorkspace.tsx:9`, `apps/web/src/modules/g02/PersonalDetailsWorkspace.tsx:44`).

Specification/design coverage found:

- OpenAPI covers a much broader G02 surface: request lifecycle, route preview, documents, approvals, diff, SLA, effective-date rules, bulk corrections, commit status, SR status, admin config, delegations, templates, e-signature, history/reports, notices, status gate, fraud, reversals, objections, retro events, and step-up (`docs/contracts/openapi/G02.yaml:33`, `docs/contracts/openapi/G02.yaml:75`).
- SQL data model defines 18 module-owned tables and explicit G02 ownership boundaries (`docs/data-model/02-G02-personal-details-workflow.sql:36`, `docs/data-model/02-G02-personal-details-workflow.sql:37`).
- SQL covers field sensitivity, approval matrix, templates, delegations, bulk correction batches, change requests, change request items, e-signatures, approvals, documents, SLA events, risk signals, retro events, objections, notices, reversals, and step-up (`docs/data-model/02-G02-personal-details-workflow.sql:133`, `docs/data-model/02-G02-personal-details-workflow.sql:638`).

## Coverage Matrix

| Requirement | BRD Evidence | Executable Evidence | Status |
|---|---:|---:|---|
| FR-G02-001 Create and Submit Change Request | `docs/brd/v3/G02-personal-details-modification-workflow.md:983`; route `apps/api/src/routes/g02.routes.ts:17`; service `apps/api/src/modules/g02/personalDetailsService.ts:48` | Implemented as create+immediate P01 start, not DRAFT/edit/submit split; only single-field requests | **PARTIAL** |
| FR-G02-002 Sensitivity Classification and P01 Routing | `docs/brd/v3/G02-personal-details-modification-workflow.md:1048`; schema `docs/data-model/02-G02-personal-details-workflow.sql:133`; contract `docs/contracts/openapi/G02.yaml:304` | Hard-coded `displayName` low and other fields high (`apps/api/src/modules/g02/personalDetailsService.ts:238`), no matrix/config route preview | **PARTIAL** |
| FR-G02-003 Supporting Documents and Authority Portal Verification | `docs/brd/v3/G02-personal-details-modification-workflow.md:1108`; schema `docs/data-model/02-G02-personal-details-workflow.sql:463`; contract `docs/contracts/openapi/G02.yaml:348` | Optional G13 evidence creation exists (`apps/api/src/modules/g02/personalDetailsService.ts:199`); verification/portal checks absent | **PARTIAL** |
| FR-G02-004 Maker-Checker Multi-Level Approval | `docs/brd/v3/G02-personal-details-modification-workflow.md:1168`; state machine `docs/contracts/state-machines.yaml:174`; route `apps/api/src/routes/g02.routes.ts:50` | Approve/reject call P01 but no multi-level topology, sendBack, queue, e-sign, or P01 action binding table | **PARTIAL** |
| FR-G02-005 Field-Level Diff and Preview | `docs/brd/v3/G02-personal-details-modification-workflow.md:1229`; contract `docs/contracts/openapi/G02.yaml:671` | Old/new scalar values stored in request (`apps/api/src/modules/g02/personalDetailsService.ts:19`), but no diff endpoint or masked reviewer comparison | **PARTIAL/GAP** |
| FR-G02-006 Rejection, Return, Resubmission, Withdrawal | `docs/brd/v3/G02-personal-details-modification-workflow.md:1281`; contract `docs/contracts/openapi/G02.yaml:238` | Reject exists (`apps/api/src/modules/g02/personalDetailsService.ts:116`); return/sendBack/resubmit/withdraw absent | **PARTIAL** |
| FR-G02-007 SLA Tracking and Escalation | `docs/brd/v3/G02-personal-details-modification-workflow.md:1337`; schema `docs/data-model/02-G02-personal-details-workflow.sql:495`; contract `docs/contracts/openapi/G02.yaml:708` | No SLA timeline/reminder/escalation service behavior | **GAP** |
| FR-G02-008 Correction vs Update and Effective-Date Rules | `docs/brd/v3/G02-personal-details-modification-workflow.md:1392`; contract `docs/contracts/openapi/G02.yaml:748` | Commit accepts an effective date (`apps/api/src/routes/g02.routes.ts:67`), but no correction/update typing, DOB hard-block, caste/gender policy, or bounds rules | **PARTIAL/GAP** |
| FR-G02-009 Bulk HR-Initiated Corrections | `docs/brd/v3/G02-personal-details-modification-workflow.md:1454`; schema `docs/data-model/02-G02-personal-details-workflow.sql:288`; contract `docs/contracts/openapi/G02.yaml:834` | No bulk correction runtime | **GAP** |
| FR-G02-010 Apply Approved Change to G01 | `docs/brd/v3/G02-personal-details-modification-workflow.md:1517`; route `apps/api/src/routes/g02.routes.ts:53`; service `apps/api/src/modules/g02/personalDetailsService.ts:128` | Display-name-only commit through G01 exists and is tested (`apps/api/test/ph07-g02-personal-details.test.cjs:47`); multi-item effective-dated commit absent | **PARTIAL** |
| FR-G02-011 SR Reflection and Reconciliation | `docs/brd/v3/G02-personal-details-modification-workflow.md:1574`; contract `docs/contracts/openapi/G02.yaml:1023` | G01 source ownership is preserved in tests (`apps/api/test/ph07-g02-personal-details.test.cjs:62`), but posting-status tracker/reconciliation/DLQ absent | **PARTIAL** |
| FR-G02-012 Approval/Sensitivity/E-Sign/Regex Configuration | `docs/brd/v3/G02-personal-details-modification-workflow.md:1631`; schema `docs/data-model/02-G02-personal-details-workflow.sql:180`; contract `docs/contracts/openapi/G02.yaml:1099` | No config CRUD/activation/safe-regex runtime | **GAP** |
| FR-G02-013 Delegation | `docs/brd/v3/G02-personal-details-modification-workflow.md:1690`; schema `docs/data-model/02-G02-personal-details-workflow.sql:260`; contract `docs/contracts/openapi/G02.yaml:1367` | Delegation exists in generic authority/P01 foundation, but no G02-specific delegation APIs or tests | **GAP** |
| FR-G02-014 Templates | `docs/brd/v3/G02-personal-details-modification-workflow.md:1745`; schema `docs/data-model/02-G02-personal-details-workflow.sql:234`; contract `docs/contracts/openapi/G02.yaml:1464` | No template runtime | **GAP** |
| FR-G02-015 Strong E-Signature | `docs/brd/v3/G02-personal-details-modification-workflow.md:1798`; schema `docs/data-model/02-G02-personal-details-workflow.sql:409`; contract `docs/contracts/openapi/G02.yaml:596` | No e-signature runtime or provider failure handling | **GAP** |
| FR-G02-016 Provenance, Field History, Audit, Reporting | `docs/brd/v3/G02-personal-details-modification-workflow.md:1853`; contract `docs/contracts/openapi/G02.yaml:1564` | P05 audit entries are recorded for simple actions (`apps/api/src/modules/g02/personalDetailsService.ts:89`, `apps/api/src/modules/g02/personalDetailsService.ts:146`); field-history/report/export/hash verification absent | **PARTIAL** |
| FR-G02-017 Data-Subject Notice and Objection Window | `docs/brd/v3/G02-personal-details-modification-workflow.md:1914`; schema `docs/data-model/02-G02-personal-details-workflow.sql:587`; contract `docs/contracts/openapi/G02.yaml:1882` | No notice/confirmation/objection-window runtime | **GAP** |
| FR-G02-018 Employment-Status Gating | `docs/brd/v3/G02-personal-details-modification-workflow.md:1971`; contract `docs/contracts/openapi/G02.yaml:1650` | Employee existence checked (`apps/api/src/modules/g02/personalDetailsService.ts:53`); no employment-status gate/elevated path | **GAP** |
| FR-G02-019 Fraud, Velocity, Anomaly | `docs/brd/v3/G02-personal-details-modification-workflow.md:2025`; schema `docs/data-model/02-G02-personal-details-workflow.sql:515`; contract `docs/contracts/openapi/G02.yaml:1979` | No fraud/risk detector runtime | **GAP** |
| FR-G02-020 Emergency Reversal | `docs/brd/v3/G02-personal-details-modification-workflow.md:2082`; schema `docs/data-model/02-G02-personal-details-workflow.sql:610`; contract `docs/contracts/openapi/G02.yaml:2090` | Simplified direct reversal exists (`apps/api/src/modules/g02/personalDetailsService.ts:161`); no dual-auth break-glass reversal | **PARTIAL** |
| FR-G02-021 Grievance and Objection | `docs/brd/v3/G02-personal-details-modification-workflow.md:2140`; schema `docs/data-model/02-G02-personal-details-workflow.sql:561`; contract `docs/contracts/openapi/G02.yaml:2202` | No grievance/objection workflow runtime | **GAP** |
| FR-G02-022 Retro-Impact Reconciliation | `docs/brd/v3/G02-personal-details-modification-workflow.md:2196`; schema `docs/data-model/02-G02-personal-details-workflow.sql:536`; contract `docs/contracts/openapi/G02.yaml:2313` | No retro event generation/retry/ack runtime | **GAP** |
| FR-G02-023 Step-Up Authentication | `docs/brd/v3/G02-personal-details-modification-workflow.md:2252`; schema `docs/data-model/02-G02-personal-details-workflow.sql:638`; contract `docs/contracts/openapi/G02.yaml:2384` | No step-up challenge/verify runtime | **GAP** |

## User-Facing Coverage

The BRD requires request wizard, reviewer queue, diff viewer, document verification, SLA timeline, bulk correction, admin config, delegation, template management, e-sign, history/reports, objection/grievance, and step-up surfaces (`docs/brd/v3/G02-personal-details-modification-workflow.md:2307`, `docs/brd/v3/G02-personal-details-modification-workflow.md:2342`). Current UI is a static workflow evidence card, not a usable G02 workspace (`apps/web/src/modules/g02/PersonalDetailsWorkspace.tsx:9`, `apps/web/src/modules/g02/PersonalDetailsWorkspace.tsx:46`).

## Critical Gaps

| Gap ID | Severity | Gap | Evidence |
|---|---|---|---|
| G02-COV-001 | Critical | OpenAPI and schema define a full workflow product, but runtime implements a reduced proof slice. | OpenAPI tags `docs/contracts/openapi/G02.yaml:33`-`75`; routes `apps/api/src/routes/g02.routes.ts:14`-`94`; service `apps/api/src/modules/g02/personalDetailsService.ts:36`-`240` |
| G02-COV-002 | Critical | Sensitive-field commit is intentionally limited to displayName, leaving PAN/Aadhaar/statutory changes uncommittable despite request creation support. | Supported field codes `apps/api/src/modules/g02/personalDetailsService.ts:9`; displayName-only guard `apps/api/src/modules/g02/personalDetailsService.ts:134`-`135` |
| G02-COV-003 | High | Compliance-heavy controls are absent: step-up, strong e-sign, dual-auth reversal, notice/objection, fraud, SLA escalation, and retro reconciliation. | BRD FRs `docs/brd/v3/G02-personal-details-modification-workflow.md:1337`, `docs/brd/v3/G02-personal-details-modification-workflow.md:1798`, `docs/brd/v3/G02-personal-details-modification-workflow.md:1914`, `docs/brd/v3/G02-personal-details-modification-workflow.md:2025`, `docs/brd/v3/G02-personal-details-modification-workflow.md:2082`, `docs/brd/v3/G02-personal-details-modification-workflow.md:2196`, `docs/brd/v3/G02-personal-details-modification-workflow.md:2252` |
| G02-COV-004 | High | UI does not implement the BRD workflow screens. | BRD UI `docs/brd/v3/G02-personal-details-modification-workflow.md:2307`; UI file `apps/web/src/modules/g02/PersonalDetailsWorkspace.tsx:9`-`46` |

## Scorecard

| Category | Score | Notes |
|---|---:|---|
| BRD line-item implementation | 8 / 23 FRs materially touched | Most are partial; 15 are runtime gaps |
| API contract conformance | Low to medium | Runtime route surface is much smaller than OpenAPI |
| Data model coverage | High as design artefact | SQL covers required tables but app runtime is in-memory and reduced |
| Backend behavior | Medium for proof slice | Create/approve/reject/commit/reverse work for display-name slice |
| Frontend behavior | Low | Static status/evidence card |
| Automated tests | Low to medium | Good proof-slice tests; no full workflow coverage |

Validation baseline captured during this review:

- `npm test` passed: 125/125 API tests.
- `npm run web:test` passed: 32/32 web tests.
- These green checks validate the implemented proof slice; they do not close the G02 BRD gaps listed here.

## Recommended Remediation Path

1. Keep the current proof slice as the regression baseline.
2. Expand G02 around the highest-risk compliance path first: sensitive self-service request for PAN/Aadhaar/category with step-up, document verification, e-sign, P01 decision, and G01 commit ownership.
3. Add notice/objection and dual-auth reversal before bulk correction.
4. Add SLA, fraud, retro reconciliation, and reporting once the sensitive-change transaction is durable.

