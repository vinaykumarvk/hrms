# PH-11 UAT Defect Triage

Marker: `UAT_DEFECT_TRIAGE`

This register captures rehearsal findings from the PH-11 UAT execution journal. It distinguishes evidence defects from business UAT defects. It also prevents the agentic process from approving release when a human owner must still accept the result. UAT sign-off remains `UAT_SIGNOFF_HUMAN_REQUIRED`; go-live remains `GO_LIVE_HUMAN_APPROVAL_PENDING`.

## Severity Policy

| Severity | Meaning | Release action |
|---|---|---|
| S1 | Legal, payroll, pension, SR integrity, security, or tenant isolation defect | Blocks go-live until fixed or formally risk-accepted by human authority |
| S2 | Workflow or business-process defect with operational workaround | Requires owner/date and release board decision |
| S3 | Reporting, documentation, cosmetic, or training gap | May proceed only with owner/date and hypercare tracking |

## Rehearsal Defect Register

| ID | Area | Severity | Finding | Owner | Target date | Decision path | Current state |
|---|---|---:|---|---|---|---|---|
| UAT-001 | Executive Analytics | S3 | Rehearsal evidence confirms read-only and scope markers, but final screenshot pack must be captured in the business UAT room. | analytics-owner | 2026-07-18 | Business owner validates screen evidence during UAT. | `BUSINESS_OWNER_PENDING` |
| UAT-002 | Compensation Readiness | S2 | Payroll and pension trace markers exist in release evidence; final pay-rule sample set needs business acknowledgement. | compensation-lead | 2026-07-18 | Compensation lead signs sample-set coverage or raises exception. | `BUSINESS_OWNER_PENDING` |
| UAT-003 | Migration and Coexistence | S2 | Dry-run reconciliation evidence is present; unresolved migration exceptions need business disposition. | migration-lead | 2026-07-18 | Migration exception board accepts, defers, or blocks. | `BUSINESS_OWNER_PENDING` |
| UAT-004 | Release Controls | S3 | Runbooks and rollback controls exist; final release board minutes must record named approvers. | release-lead | 2026-07-19 | Release control board records go/no-go decision. | `GO_LIVE_HUMAN_APPROVAL_PENDING` |

## Triage Rules

- No S1 item may be closed by an agentic gate.
- Every S2 and S3 item must retain owner and target date until the human release board records closure.
- Evidence-only fixes may be updated in the repository, but acceptance and production release remain external decisions.
- A defect may not be downgraded without a named owner, reason, and meeting reference.
- This register is intentionally conservative: it records that PH-11 rehearsal is green while final UAT acceptance remains pending.

## Open Approval Markers

- `UAT_SIGNOFF_HUMAN_REQUIRED`
- `BUSINESS_OWNER_PENDING`
- `GO_LIVE_HUMAN_APPROVAL_PENDING`

