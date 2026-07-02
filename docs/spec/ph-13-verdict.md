# PH-13 Verdict: Release Candidate Seal and Approval Intake

Phase: `PH-13`

Verdict: release-candidate sealed; human approvals still pending.

Release state: `GO_LIVE_HUMAN_APPROVAL_PENDING`

## Scope

PH-13 follows PH-12 release-board readiness. It seals the PH-12 board package using a `SHA256_EVIDENCE_SEAL`, prepares human approval intake, and creates evidence archive/handoff artifacts. The phase is intentionally limited to local evidence sealing and approval-intake guardrails.

This verdict confirms that the release candidate is sealed and machine-checked. It does not authorize UAT acceptance, CAB approval, production deployment, target-environment smoke, production cutover, or rollback execution.

## Subphase Results

| Subphase | Result | Evidence |
|---|---|---|
| PH-13A | GREEN | Detailed plan, prompts, checks, source plan, readable plan note, and pipeline wiring are present. |
| PH-13B | GREEN | `RELEASE_CANDIDATE_SEALED`, `EVIDENCE_CHECKSUM_MANIFEST`, `SHA256_EVIDENCE_SEAL`, verifier script, and seal tests are present. |
| PH-13C | GREEN | `HUMAN_APPROVAL_INTAKE_PENDING`, change-ticket template, and approval-intake guard are present. |
| PH-13D | GREEN | `EVIDENCE_ARCHIVE_READY`, `RELEASE_HANDOFF_MEMO`, and `POST_BOARD_ACTION_REGISTER` are present. |
| PH-13E | GREEN | Manifest evidence and full conformance are verified by the PH-13E oracle. |

## Human Decision Boundary

The following remain human-controlled:

- UAT acceptance remains pending.
- CAB/release approval remains pending.
- Go-live authorization remains `GO_LIVE_HUMAN_APPROVAL_PENDING`.
- Target-environment smoke with credentials remains human-run.
- Production cutover remains human-run.
- Rollback execution remains human-run.

PH-13 is "release-candidate sealed", not release-approved. The approval intake remains `HUMAN_APPROVAL_INTAKE_PENDING`, and the current approval state is `APPROVAL_DOCUMENTS_NOT_PRESENT`.

## Evidence Summary

| Evidence | Purpose |
|---|---|
| `docs/release/release-candidate-manifest.md` | Defines the HRMS-RC-PH13 sealed evidence package. |
| `docs/release/evidence-checksum-manifest.json` | Records SHA-256 hashes for the sealed board package. |
| `ops/verify-release-candidate-seal.sh` | Recomputes hashes and fails on drift. |
| `docs/release/human-approval-intake.md` | Defines how external human approval evidence will be attached later. |
| `docs/release/change-ticket-template.md` | Defines the external change ticket fields humans must complete. |
| `ops/validate-human-approval-intake.sh` | Confirms approval documents and production credentials are absent. |
| `docs/release/evidence-archive-index.md` | Indexes release-candidate evidence for archive and board handoff. |
| `docs/release/release-handoff-memo.md` | Hands the sealed package to the human release-board process. |
| `docs/release/post-board-action-register.md` | Lists human-owned actions after the board decision. |
| `apps/api/test/ph13-release-candidate-seal.test.cjs` | Verifies seal, pending-approval boundary, and archive markers. |

## Residual Risks

| Risk | Owner | Date | Disposition |
|---|---|---|---|
| A sealed artifact may change before the board reviews it. | release-engineer | 2026-07-19 | Recompute seal and rerun PH-13B. |
| Human approvals may require external document references not available in the repo. | release-chair | 2026-07-19 | Attach after board process. |
| Target-environment smoke may reveal environment-specific issues. | ops-lead | 2026-07-19 | Run only after human authorization. |
| Approval evidence may contain sensitive information. | security-lead | 2026-07-19 | Store externally and link redacted references only. |

## Final Position

PH-13 completes the agentic release-candidate sealing work. The next action is the human approval cycle using the sealed candidate, checksum verifier, intake guardrails, and archive/handoff package. The repository remains sealed and ready for board action; production go-live remains pending.

