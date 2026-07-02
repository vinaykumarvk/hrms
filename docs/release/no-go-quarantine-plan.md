# PH-14 No-Go Quarantine Plan

Marker: `NO_GO_QUARANTINE_PLAN`

This plan describes what to do if the release board cannot proceed, if the PH-13 seal drifts, if approval evidence is missing, or if production credentials are requested before authorization.

## Quarantine Triggers

| Trigger | Action | Owner | Date |
|---|---|---|---|
| Checksum drift | Stop board progression and decide whether to reseal | release-engineer | 2026-07-19 |
| Missing approval evidence | Keep `GO_LIVE_HUMAN_APPROVAL_PENDING` | release-chair | 2026-07-19 |
| Unexpected approval file in repo | Quarantine file and review redaction | security-lead | 2026-07-19 |
| Production credential request | Stop agentic work and move to human change process | ops-lead | 2026-07-19 |
| S1 defect or legal block | Record no-go and assign remediation owner | release-chair | 2026-07-19 |

## Quarantine Rules

- Do not edit sealed artifacts to force a green result.
- Do not attach unredacted approval evidence to this repository.
- Do not proceed to target smoke without a human board decision.
- Do not convert a no-go into conditional go without signed human approval.
- Keep `HUMAN_BOARD_ACTION_REQUIRED` until the release chair records a decision.

## Current State

`GO_LIVE_HUMAN_APPROVAL_PENDING`

The candidate is stable for board review, but approval is not granted.

## Quarantine Register Template

| Field | Required entry |
|---|---|
| Quarantine trigger | checksum drift, missing approval, security concern, migration exception, production credential request, or board no-go |
| Decision owner | release-chair or delegated board owner |
| Technical owner | release-engineer, ops-lead, security-lead, migration-lead, or module owner |
| Date/time | human board timestamp |
| Evidence reference | redacted external reference or repository path |
| Required correction | reseal, redaction, remediation, new UAT evidence, or change-ticket update |
| Re-entry check | PH-13B reseal, PH-14B drift watch, PH-14C readiness check, or full regression |

## Re-Entry Criteria

The release candidate can return to board review only after the quarantine owner records a correction path and the relevant automated gate is green again. A changed sealed artifact requires a new evidence checksum manifest. A missing human approval requires external approval evidence, not a repository edit. A production credential concern requires security review before any further target-environment activity.
