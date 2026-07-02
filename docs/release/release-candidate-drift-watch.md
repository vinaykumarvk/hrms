# PH-14 Release Candidate Drift Watch

Marker: `POST_SEAL_DRIFT_WATCH`

This document defines how the sealed HRMS-RC-PH13 package is checked after sealing and before the human release board. The check is read-only and local. It does not approve release, receive approval documents, introduce credentials, execute target-environment smoke, perform cutover, or execute rollback.

## Watch Inputs

| Input | Source | Expected state |
|---|---|---|
| Checksum manifest | `docs/release/evidence-checksum-manifest.json` | parses and references existing artifacts |
| Seal verifier | `ops/verify-release-candidate-seal.sh` | prints `PH13_RELEASE_CANDIDATE_SEAL_GREEN` |
| Approval intake guard | `ops/validate-human-approval-intake.sh` | keeps `HUMAN_APPROVAL_INTAKE_PENDING` |
| Drift report | `docs/release/post-seal-drift-report.md` | records `DRIFT_STATUS_GREEN` |

## Fail-Closed Rules

- If a sealed artifact hash changes, the release candidate is not silently accepted.
- If a sealed artifact is missing, the release candidate is quarantined.
- If approval evidence appears in the repository before human intake, progression is quarantined.
- If production credentials are present in the shell, readiness checks fail.
- If the board requests a changed artifact, PH-13B must be rerun to create a new seal.

## Current Watch State

- `PH13_SEAL_VERIFIED`
- `SEALED_ARTIFACTS_UNCHANGED`
- `HUMAN_APPROVALS_STILL_PENDING`
- `GO_LIVE_HUMAN_APPROVAL_PENDING`

The watch confirms evidence stability. It does not grant approval.

## Operating Cadence

The drift watch should be run immediately before the release board packet is circulated, again at the start of the board meeting, and again if the board asks for any supporting artifact to be amended. A green drift watch means the board is looking at the same package that was sealed in PH-13. A red drift watch means the release candidate is no longer the same candidate and must not be approved without explicit reseal.

## Ownership

| Activity | Owner | Date | Action on failure |
|---|---|---|---|
| Run drift checker | release-engineer | 2026-07-19 | stop board progression |
| Validate approval intake remains pending | release-chair | 2026-07-19 | quarantine unexpected approval files |
| Confirm no credentials are present | security-lead | 2026-07-19 | remove secret from shell/repo and restart evidence review |
