# PH-11 Cutover Rehearsal Runbook

Marker: `CUTOVER_REHEARSAL_COMPLETED`

This runbook rehearses the cutover control sequence in a local or non-production environment only. It does not deploy to production, does not approve production release, and does not execute rollback. The release state after this runbook remains `GO_LIVE_HUMAN_APPROVAL_PENDING`.

## Rehearsal Preconditions

| Check | Evidence | Owner | Date |
|---|---|---|---|
| PH-10 release evidence exists | deployment, rollback, coexistence, UAT, and release evidence pack | release-lead | 2026-07-19 |
| PH-11 UAT rehearsal exists | `UAT_EXECUTION_REHEARSAL` and `UAT_DEFECT_TRIAGE` | uat-lead | 2026-07-19 |
| Release freeze check | `RELEASE_FREEZE_CHECK` recorded before local smoke | release-manager | 2026-07-19 |
| Rollback authority assigned | `ROLLBACK_AUTHORITY_ASSIGNED` to ops lead plus release chair | ops-lead | 2026-07-19 |
| Production mutation guard | `NO_PRODUCTION_MUTATION` enforced by local release smoke | release-engineer | 2026-07-19 |

## Rehearsal Steps

1. Confirm the current branch and git status are recorded for audit evidence.
2. Confirm no production environment variables, production hostnames, or production database URLs are present in the shell used for the rehearsal.
3. Run `bash ops/local-release-smoke.sh`.
4. Confirm required PH-11 documents are present and approval-sensitive markers remain pending.
5. Confirm PH-10 deployment and rollback runbooks are still the authoritative production references.
6. Record any failure in the UAT defect triage register with owner and date.
7. Stop before any real deployment, infrastructure change, or database mutation.

## Rehearsal Result

The rehearsal is complete when `ops/local-release-smoke.sh` prints `PH11_LOCAL_RELEASE_SMOKE_GREEN` and exits with status 0. This means the local release evidence was self-consistent, not that a release was approved.

## Human Decisions Still Required

- Business UAT sign-off: `UAT_SIGNOFF_HUMAN_REQUIRED`
- Go-live and production cutover: `GO_LIVE_HUMAN_APPROVAL_PENDING`
- Rollback execution authority on release day: assigned but human-controlled through `ROLLBACK_AUTHORITY_ASSIGNED`

## No-Production-Mutation Control

`NO_PRODUCTION_MUTATION`

PH-11 does not connect to production, run migrations, unlock payroll periods, alter Service Register facts, write pension facts, or deploy artifacts. Any request to perform those actions stops the agentic phase and goes to the release control board.

