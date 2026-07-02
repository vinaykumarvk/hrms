# PH-14 Board-Day Run Card

Marker: `BOARD_DAY_RUN_CARD`

This run card is used on the day of the human release board. It is a checklist for people, not an automated release action. It keeps production execution outside the agentic pipeline and records that no production action is authorized by this file.

## Pre-Board Checks

| Step | Command or evidence | Owner | Status |
|---|---|---|---|
| Verify release-candidate seal | `bash ops/verify-release-candidate-seal.sh` | release-engineer | required |
| Verify drift watch | `bash ops/check-release-candidate-drift.sh` | release-engineer | required |
| Verify approval intake is pending | `bash ops/validate-human-approval-intake.sh` | release-chair | required |
| Verify board packet | PH-12 and PH-13 release docs | release-lead | required |
| Verify no production credentials in shell | board-day readiness check | ops-lead | required |

## Board-Day Human Steps

| Step | Human owner | Output |
|---|---|---|
| Review UAT evidence | business-owner | human decision outside repo |
| Review security and migration risks | security-lead and migration-lead | risk acceptance or no-go |
| Review target-smoke prerequisites | ops-lead | human-run target smoke decision |
| Record go/no-go | release-chair | signed decision record outside repo |
| Record no-go quarantine if needed | release-chair | quarantine action list |

## Execution Boundary

`NO_PRODUCTION_EXECUTION`

The run card does not perform target smoke, cutover, rollback, database migration, production deployment, or credential handling. Those remain human-owned actions after formal approval.

## Required Pending State

- `HUMAN_BOARD_ACTION_REQUIRED`
- `GO_LIVE_HUMAN_APPROVAL_PENDING`
- `HUMAN_APPROVALS_STILL_PENDING`

