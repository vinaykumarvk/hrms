# PH-11 UAT and Cutover Governance Rehearsal Plan

PH-11 is a post-PH10 release-governance phase. The original development plan ended at PH-10 with release readiness, and PH-10 explicitly left UAT sign-off, production cutover, rollback execution, and live deployment as human-controlled actions. PH-11 therefore does not perform production cutover. It prepares and rehearses the governance process that human release authorities will use.

The phase is intentionally evidence-first: it verifies that UAT scripts are executable as a controlled rehearsal, defects have triage ownership, cutover has an accountable control board, rollback authority is assigned, support and hypercare are ready, and the full application still passes regression checks. The final status is "go-live approval pending", not "go-live approved".

| Step | Gate | Scope | External oracle |
|---|---:|---|---|
| PH-11A | auto | Freeze PH-11 detailed plan, prompts, executable checks, pipeline wiring, and plan notes. | `bash docs/spec/pipeline/checks/ph-11a.sh` |
| PH-11B | auto | Prepare UAT execution journal and defect-triage evidence with explicit human sign-off pending. | `bash docs/spec/pipeline/checks/ph-11b.sh` |
| PH-11C | auto | Prepare non-production cutover rehearsal, local release smoke script, cutover board, release freeze, rollback authority, and no-production-mutation evidence. | `bash docs/spec/pipeline/checks/ph-11c.sh` |
| PH-11D | auto | Prepare support handoff, operational RACI, incident matrix, hypercare window, and SLA ownership. | `bash docs/spec/pipeline/checks/ph-11d.sh` |
| PH-11E | auto | Add PH-11 verdict, manifest evidence, state files, and full API/web regression coverage. | `bash docs/spec/pipeline/checks/ph-11e.sh` |

## Scope Rules

- PH-11 may execute local checks and non-production rehearsal scripts only.
- PH-11 must not mark UAT, go-live, production cutover, CAB approval, rollback execution, or live deployment as approved.
- Every document that references approval must include `GO_LIVE_HUMAN_APPROVAL_PENDING` or `UAT_SIGNOFF_HUMAN_REQUIRED`.
- Defects, migration exceptions, residual risks, and operational tasks must have owners and dates.
- The local release smoke must not use production credentials, production URLs, destructive database commands, or live infrastructure.
- The final phase can be GREEN only for governance rehearsal completion.

## Evidence

- `docs/release/uat-execution-journal.md`
- `docs/release/uat-defect-triage.md`
- `docs/release/cutover-control-board.md`
- `ops/cutover-rehearsal-runbook.md`
- `ops/local-release-smoke.sh`
- `docs/release/hypercare-plan.md`
- `docs/release/support-handoff.md`
- `docs/release/operational-raci.md`
- `apps/api/test/ph11-uat-governance.test.cjs`
- `docs/spec/ph-11-verdict.md`

## Exit Position

PH-11 is complete when UAT/cutover governance is rehearsed, all readiness artifacts are machine-checked, local release smoke is green, full API/web regression passes, and the manifest records that human approval is still pending. The next action after PH-11 is a human release meeting, not an agentic production cutover.
