# PH-13 Release Candidate Seal and Approval Intake Plan

PH-13 follows PH-12. PH-12 made the release-board package ready; PH-13 seals that package as a release candidate and prepares approval-intake guardrails. This phase creates machine-verifiable checksums, a sealed evidence manifest, approval intake templates, and a handoff/archive index.

PH-13 is not go-live. It does not sign UAT, approve CAB, authorize cutover, introduce production credentials, execute target-environment smoke, or execute rollback. The final status is release-candidate sealed with human approvals still pending.

| Step | Gate | Scope | External oracle |
|---|---:|---|---|
| PH-13A | auto | Freeze PH-13 detailed plan, prompts, checks, pipeline wiring, and plan notes. | `bash docs/spec/pipeline/checks/ph-13a.sh` |
| PH-13B | auto | Build release-candidate manifest, evidence checksum manifest, checksum verifier, and governance tests. | `bash docs/spec/pipeline/checks/ph-13b.sh` |
| PH-13C | auto | Build human approval intake, change-ticket template, and approval-intake guard script. | `bash docs/spec/pipeline/checks/ph-13c.sh` |
| PH-13D | auto | Build evidence archive index, release handoff memo, and post-board action register. | `bash docs/spec/pipeline/checks/ph-13d.sh` |
| PH-13E | auto | Add PH-13 verdict, manifest evidence, state files, and full API/web regression. | `bash docs/spec/pipeline/checks/ph-13e.sh` |

## Scope Rules

- PH-13 may seal evidence by hashing files and checking local artifacts.
- PH-13 must not record any approval-complete, sign-off-complete, cutover-complete, or production rollback execution state.
- Every approval-sensitive artifact must retain `GO_LIVE_HUMAN_APPROVAL_PENDING`, `HUMAN_APPROVAL_INTAKE_PENDING`, or equivalent pending markers.
- The checksum verifier must not mutate source artifacts.
- Approval-intake scripts must validate that approval files are absent or pending; they must not fabricate approvals.

## Evidence

- `docs/release/release-candidate-manifest.md`
- `docs/release/evidence-checksum-manifest.json`
- `ops/verify-release-candidate-seal.sh`
- `docs/release/human-approval-intake.md`
- `docs/release/change-ticket-template.md`
- `ops/validate-human-approval-intake.sh`
- `docs/release/evidence-archive-index.md`
- `docs/release/release-handoff-memo.md`
- `docs/release/post-board-action-register.md`
- `apps/api/test/ph13-release-candidate-seal.test.cjs`
- `docs/spec/ph-13-verdict.md`

## Exit Position

PH-13 is complete when the release candidate evidence package is sealed, checksums verify, approval-intake guardrails are in place, archive/handoff evidence is complete, and the repository still passes full regression. The next action remains a human approval cycle.
