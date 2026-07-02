# PH-12 Go/No-Go Decision Record Template

Marker: `GO_NO_GO_DECISION_TEMPLATE`

This template is intentionally unapproved. A human release chair must complete it during the release board meeting. Until then, the decision state remains `GO_NO_GO_HUMAN_DECISION_REQUIRED` and `GO_LIVE_HUMAN_APPROVAL_PENDING`.

## Meeting Details

| Field | Value |
|---|---|
| Meeting date/time | to be completed by release chair |
| Release candidate | to be completed by release chair |
| Chair | release-chair |
| Recorder | release-manager |
| Required quorum | business-owner, release-chair, ops-lead, security-lead, migration-lead |

## Decision Inputs

| Input | Evidence path | Owner | OWNER_DATE | Board disposition |
|---|---|---|---|---|
| UAT acceptance | `docs/release/uat-execution-journal.md` | business-owner | business-owner / 2026-07-19 | pending |
| Release-board dossier | `docs/release/release-board-dossier.md` | release-lead | release-lead / 2026-07-19 | pending |
| Target readiness dry-run | `docs/release/target-environment-readiness.md` | ops-lead | ops-lead / 2026-07-19 | pending |
| Security evidence | `docs/release/security-hardening-evidence.md` | security-lead | security-lead / 2026-07-19 | pending |
| Migration evidence | `docs/release/coexistence-plan.md` | migration-lead | migration-lead / 2026-07-19 | pending |

## Decision Fields

| Field | Human entry required |
|---|---|
| Decision | GO / NO-GO / GO WITH ACCEPTED RISKS |
| Accepted residual risks | human entry required |
| Conditions before target smoke | human entry required |
| Approver names and signatures | human entry required |
| Timestamp | human entry required |

## Boundary

This template may be filled only by the human board. The repository must not pre-fill approval. `CAB_APPROVAL_HUMAN_REQUIRED` remains active until the board records a decision outside the agentic pipeline.

