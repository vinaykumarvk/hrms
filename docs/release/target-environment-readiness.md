# PH-12 Target-Environment Readiness

Marker: `TARGET_ENVIRONMENT_READINESS_DRY_RUN`

This document defines the checks that must be run before a human-approved target-environment smoke. PH-12 executes only the dry-run form. It does not require production credentials, does not call live infrastructure, and does not mutate any target environment.

## Dry-Run Scope

| Check | Purpose | Owner | Date | State |
|---|---|---|---|---|
| Manifest parse | Ensure release evidence remains machine-readable | release-engineer | 2026-07-19 | dry-run ready |
| PH-10/PH-11/PH-12 evidence presence | Ensure board packet is complete | release-lead | 2026-07-19 | dry-run ready |
| Environment variable guard | Refuse production-like local values | ops-lead | 2026-07-19 | dry-run ready |
| Package script presence | Confirm API/web regressions remain callable | release-engineer | 2026-07-19 | dry-run ready |
| Human target-smoke boundary | Keep target execution after board approval | release-chair | 2026-07-19 | `TARGET_SMOKE_HUMAN_RUN_REQUIRED` |

## Non-Mutation Guard

Marker: `NO_TARGET_ENV_MUTATION`

The dry-run check does not deploy, migrate, write database rows, unlock payroll periods, alter Service Register facts, refresh production marts, call external treasury integrations, or upload files to a live document vault. Production credentials are not needed: `PRODUCTION_CREDENTIALS_NOT_REQUIRED`.

## Human Target Smoke

Marker: `TARGET_SMOKE_HUMAN_RUN_REQUIRED`

After the release board approves the release, a human release engineer may run target-environment smoke with approved credentials and a change ticket. That run must record target environment, timestamp, approver, artifact version, rollback owner, and result. PH-12 does not perform that action.

## Required Inputs for Human Run

| Input | Owner | Date | Status |
|---|---|---|---|
| Signed go/no-go decision record | release-chair | 2026-07-19 | pending |
| Approved change ticket | release-manager | 2026-07-19 | pending |
| Target environment URL and credentials | ops-lead | 2026-07-19 | pending |
| Rollback bridge roster | ops-lead | 2026-07-19 | pending |

