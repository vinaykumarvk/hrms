# PH-12 Release Board Agenda

Marker: `RELEASE_BOARD_AGENDA`

This agenda structures the human release board meeting. It does not record approval. The board must complete the go/no-go decision record separately after reviewing evidence and residual risks.

## Meeting Objective

Decide whether HRMS may proceed from release-board readiness to the next human-controlled release action. The meeting must preserve `GO_NO_GO_HUMAN_DECISION_REQUIRED` until the chair records a signed decision.

## Agenda

| Timebox | Topic | Presenter | Evidence | OWNER_DATE |
|---|---|---|---|---|
| 10 min | Release scope and exclusions | release-lead | PH-12 release-board dossier | release-lead / 2026-07-19 |
| 15 min | UAT rehearsal and human sign-off status | business-owner | UAT journal and defect triage | business-owner / 2026-07-19 |
| 15 min | Security, RLS, PII, audit, and secrets posture | security-lead | hardening evidence and release pack | security-lead / 2026-07-19 |
| 15 min | Migration and coexistence exceptions | migration-lead | migration dry-run and exception evidence | migration-lead / 2026-07-19 |
| 10 min | Operations, hypercare, and support handoff | service-manager | support handoff, RACI, hypercare plan | service-manager / 2026-07-19 |
| 10 min | Rollback readiness | ops-lead | rollback authorization template | ops-lead / 2026-07-19 |
| 15 min | Go/no-go deliberation | release-chair | decision record template | release-chair / 2026-07-19 |

## Required Outputs

- Completed go/no-go decision record.
- Completed rollback authorization template if a release is authorized.
- Residual-risk owner/date list.
- Confirmed target-environment smoke owner and time.
- Confirmed escalation bridge and support coverage.

## Boundary

The agenda is ready, but the decision is not made here. Production release remains `GO_LIVE_HUMAN_APPROVAL_PENDING`.

