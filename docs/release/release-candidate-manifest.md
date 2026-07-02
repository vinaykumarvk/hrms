# PH-13 Release Candidate Manifest

Marker: `RELEASE_CANDIDATE_SEALED`

This manifest defines the release-candidate evidence package that the human release board can review. It seals the evidence by naming the included artifacts and linking them to `docs/release/evidence-checksum-manifest.json`. Sealing evidence does not approve release. The approval state remains `GO_LIVE_HUMAN_APPROVAL_PENDING`.

## Candidate Identity

| Field | Value |
|---|---|
| Release candidate | HRMS-RC-PH13 |
| Scope | HRMS development evidence, release-board package, target dry-run package, and human decision templates |
| Seal type | `SHA256_EVIDENCE_SEAL` |
| Approval state | `NO_APPROVAL_IMPLIED` |
| Human approval state | `HUMAN_APPROVAL_INTAKE_PENDING` |
| Production state | no production deployment, no production credentials, no target-environment execution |

## Sealed Evidence Set

The checksum manifest covers the PH-12 board package and decision templates:

| Artifact | Purpose |
|---|---|
| `docs/spec/ph-12-verdict.md` | Release-board readiness verdict and human-decision boundary. |
| `docs/release/release-board-dossier.md` | Board packet summary and evidence rollup. |
| `docs/release/human-approval-checklist.md` | Human approval checklist with owner/date/status. |
| `docs/release/target-environment-readiness.md` | Dry-run target-environment readiness scope. |
| `docs/release/environment-evidence-manifest.md` | Target evidence manifest and dry-run assertions. |
| `docs/release/release-board-agenda.md` | Human board agenda. |
| `docs/release/go-no-go-decision-record-template.md` | Go/no-go decision template without pre-filled approval. |
| `docs/release/rollback-authorization-template.md` | Rollback authorization template without execution. |

## Seal Rules

- The seal is read-only and local.
- The verifier recomputes hashes and fails closed on missing files or hash mismatches.
- The seal records that the release candidate package is stable enough for human review.
- The seal does not record approval-complete, sign-off-complete, target-smoke-complete, production-cutover-complete, or rollback-executed states.

## Human Boundary

`NO_APPROVAL_IMPLIED`

Human approvals must be attached through the approval-intake process after the board meeting. Until then, this package is release-candidate sealed but not approved.
