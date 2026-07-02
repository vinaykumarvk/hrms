# PH-12 Release Board Dossier

Marker: `RELEASE_BOARD_READY`

This dossier is the single packet the release board can use to decide whether HRMS may proceed to UAT sign-off and go-live. It is a readiness artifact only. It does not approve UAT, CAB, production cutover, or rollback execution. The release state remains `GO_LIVE_HUMAN_APPROVAL_PENDING`.

## Evidence Rollup

| Evidence area | Source | Current state | Owner | Date |
|---|---|---|---|---|
| Development completion | PH-00 through PH-10 manifest evidence | complete for development evidence | release-lead | 2026-07-19 |
| UAT rehearsal | PH-11 UAT execution journal and defect triage | rehearsal complete, business sign-off pending | business-owner | 2026-07-19 |
| Cutover rehearsal | PH-11 local release smoke and cutover board | rehearsal complete, production approval pending | ops-lead | 2026-07-19 |
| Security and privacy | PH-10 hardening evidence, P02/RLS, PII suppression | evidence-ready for board review | security-lead | 2026-07-19 |
| Migration and coexistence | PH-10 migration dry-run and coexistence plan | evidence-ready, exception acceptance pending | migration-lead | 2026-07-19 |
| Operations and hypercare | PH-11 support handoff, RACI, and hypercare plan | support package ready | support-lead | 2026-07-19 |

## Human Decision Register

Marker: `GO_NO_GO_HUMAN_DECISION_REQUIRED`

| Decision | Required approver | Required input | Status | Owner/date |
|---|---|---|---|---|
| UAT acceptance | business-owner | UAT journal, defect triage, signed minutes | `UAT_SIGNOFF_HUMAN_REQUIRED` | business-owner / 2026-07-19 |
| CAB/release board approval | release-chair | complete dossier, security, migration, ops evidence | `CAB_APPROVAL_HUMAN_REQUIRED` | release-chair / 2026-07-19 |
| Production go-live | release-chair | UAT acceptance and CAB decision | `GO_LIVE_HUMAN_APPROVAL_PENDING` | release-chair / 2026-07-19 |
| Rollback execution authority | release-chair and ops-lead | rollback authorization template | `ROLLBACK_EXECUTION_HUMAN_REQUIRED` | ops-lead / 2026-07-19 |

## Board Questions

1. Are there unresolved S1 defects?
2. Have S2/S3 defects been accepted with owner/date and business rationale?
3. Is migration exception acceptance documented?
4. Are target-environment checks ready to run without changing production state?
5. Is the rollback authority named and available during the release window?

## Boundary Statement

This dossier is `RELEASE_BOARD_READY`; it is not a release approval. The next required action is a human board meeting that records go/no-go in the provided decision template.

