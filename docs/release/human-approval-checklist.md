# PH-12 Human Approval Checklist

Marker: `GO_NO_GO_HUMAN_DECISION_REQUIRED`

This checklist enumerates the approvals that cannot be delegated to the agentic pipeline. Each row must be completed by a named human authority before production release. PH-12 keeps every approval pending by design.

## Required Approval Items

| Approval item | Human authority | Evidence input | Pending marker | OWNER_DATE |
|---|---|---|---|---|
| Business UAT acceptance | business-owner | UAT execution journal, defect triage, signed minutes | `UAT_SIGNOFF_HUMAN_REQUIRED` | business-owner / 2026-07-19 |
| CAB/release board decision | release-chair | release-board dossier and agenda | `CAB_APPROVAL_HUMAN_REQUIRED` | release-chair / 2026-07-19 |
| Go-live authorization | release-chair | go/no-go decision record | `GO_LIVE_HUMAN_APPROVAL_PENDING` | release-chair / 2026-07-19 |
| Rollback execution authorization | release-chair and ops-lead | rollback authorization template and bridge roster | `ROLLBACK_EXECUTION_HUMAN_REQUIRED` | ops-lead / 2026-07-19 |
| Migration exception acceptance | migration-lead and business-owner | reconciliation and exception register | pending human acceptance | migration-lead / 2026-07-19 |
| Security residual-risk acceptance | security-lead | hardening, RLS, PII, audit, secrets evidence | pending human acceptance | security-lead / 2026-07-19 |
| Operational acceptance | service-manager | support handoff, RACI, hypercare, SLA owners | pending human acceptance | service-manager / 2026-07-19 |

## Completion Rules

- No approval item may be completed by repository text alone.
- Each approval needs signed meeting minutes or equivalent external record.
- Approval evidence must name the approver, timestamp, decision, and accepted residual risks.
- Production credentials may be introduced only after the release chair authorizes the release procedure.
- If any approval is missing, the release remains `GO_LIVE_HUMAN_APPROVAL_PENDING`.

## Agentic Boundary

The agentic checks can verify this checklist exists and that every row has an owner/date/status. They cannot change the pending markers, cast a board vote, or authorize deployment.

