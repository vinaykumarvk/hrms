# PH-13 Evidence Archive Index

Marker: `EVIDENCE_ARCHIVE_READY`

This index lists the release-candidate evidence that should be archived or linked after the human release board. It is prepared before approval so the board has a complete package. The release state remains `GO_LIVE_HUMAN_APPROVAL_PENDING`.

## Archive Contents

| Evidence item | Path | Owner | OWNER_DATE | Archive state |
|---|---|---|---|---|
| Release-candidate manifest | `docs/release/release-candidate-manifest.md` | release-manager | release-manager / 2026-07-19 | ready |
| Checksum manifest | `docs/release/evidence-checksum-manifest.json` | release-engineer | release-engineer / 2026-07-19 | ready |
| Checksum verifier | `ops/verify-release-candidate-seal.sh` | release-engineer | release-engineer / 2026-07-19 | ready |
| Release-board dossier | `docs/release/release-board-dossier.md` | release-lead | release-lead / 2026-07-19 | ready |
| Human approval intake | `docs/release/human-approval-intake.md` | release-chair | release-chair / 2026-07-19 | pending human input |
| Change ticket template | `docs/release/change-ticket-template.md` | release-manager | release-manager / 2026-07-19 | pending human input |
| Post-board action register | `docs/release/post-board-action-register.md` | release-chair | release-chair / 2026-07-19 | pending human action |

## Archive Rules

- Archive references must preserve checksum values.
- Human approval documents must be attached only after the board meeting.
- Production credentials must never be archived in this repository.
- Evidence drift after the seal requires a new checksum manifest.

## Current State

`HUMAN_BOARD_ACTION_REQUIRED`

The archive is ready to receive human board outputs, but no approval output is present yet.

