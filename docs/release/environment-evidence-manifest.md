# PH-12 Environment Evidence Manifest

Marker: `TARGET_ENVIRONMENT_READINESS_DRY_RUN`

This manifest lists the artifacts that must be available before a target-environment smoke can be run by a human release engineer. PH-12 validates these artifacts locally and records that target execution remains pending.

| Artifact | Evidence path | Required marker | Owner/date |
|---|---|---|---|
| Release board dossier | `docs/release/release-board-dossier.md` | `RELEASE_BOARD_READY` | release-lead / 2026-07-19 |
| Human approval checklist | `docs/release/human-approval-checklist.md` | `GO_NO_GO_HUMAN_DECISION_REQUIRED` | release-chair / 2026-07-19 |
| UAT execution journal | `docs/release/uat-execution-journal.md` | `UAT_EXECUTION_REHEARSAL` | business-owner / 2026-07-19 |
| Cutover control board | `docs/release/cutover-control-board.md` | `GO_LIVE_HUMAN_APPROVAL_PENDING` | release-chair / 2026-07-19 |
| Local release smoke | `ops/local-release-smoke.sh` | `PH11_LOCAL_RELEASE_SMOKE_GREEN` | ops-lead / 2026-07-19 |
| Target readiness dry-run | `ops/target-environment-readiness-check.sh` | `PH12_TARGET_READINESS_DRY_RUN_GREEN` | release-engineer / 2026-07-19 |

## Dry-Run Assertions

- `PRODUCTION_CREDENTIALS_NOT_REQUIRED`
- `NO_TARGET_ENV_MUTATION`
- `TARGET_SMOKE_HUMAN_RUN_REQUIRED`
- Target smoke is not executed during PH-12.

## Evidence Handling

The target-environment evidence generated after human approval must be stored outside this dry-run manifest or appended under a signed release-board record. The repository can define the evidence shape, but it cannot stand in for the human-controlled target execution.

