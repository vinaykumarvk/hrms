# PH-13 Human Approval Intake

Marker: `HUMAN_APPROVAL_INTAKE_PENDING`

This document defines how human approvals will be attached to the sealed release candidate after the release board meets. PH-13 does not create approval records. It prepares the intake path and records that approval documents are not present yet: `APPROVAL_DOCUMENTS_NOT_PRESENT`.

## Intake Scope

| Approval evidence | Required owner | Required date | Current state |
|---|---|---|---|
| UAT sign-off minutes | business-owner | human meeting date | pending |
| CAB/release-board decision | release-chair | human meeting date | pending |
| Go-live authorization | release-chair | human meeting date | `GO_LIVE_HUMAN_APPROVAL_PENDING` |
| Target-environment smoke authorization | ops-lead | human meeting date | pending |
| Rollback execution authority | release-chair and ops-lead | human meeting date | pending |
| Security risk acceptance | security-lead | human meeting date | pending |
| Migration exception acceptance | migration-lead | human meeting date | pending |

## Intake Rules

- Approval documents must come from the human board process, not generated repository text.
- Each approval must name the approver, date/time, decision, conditions, and accepted risks.
- The release candidate checksum seal must be verified before approval evidence is attached.
- Production credentials are not stored in the repository: `NO_PRODUCTION_CREDENTIALS`.
- If an approval document is missing, the release state remains `GO_LIVE_HUMAN_APPROVAL_PENDING`.

## Expected Storage

Human approval evidence should be linked from the external change-ticket system or stored in a controlled document repository. The repository may keep a redacted reference after approval, but PH-13 does not create that reference.

## Current State

`APPROVAL_DOCUMENTS_NOT_PRESENT`

The release candidate is sealed and ready for human review. It is not approved.

