# PH-14 Board Decision Intake Playbook

Marker: `BOARD_DECISION_INTAKE_PLAYBOOK`

This playbook explains how the human release board decision should be received after PH-14. It does not receive the decision and does not approve release. It keeps board action explicit and auditable.

## Intake Steps

| Step | Owner | Date | Output |
|---|---|---|---|
| Verify drift watch is green | release-engineer | 2026-07-19 | PH-14B output |
| Confirm board quorum | release-chair | 2026-07-19 | external meeting record |
| Review UAT, security, migration, and operations evidence | board members | 2026-07-19 | external decision notes |
| Record go/no-go | release-chair | 2026-07-19 | external decision record |
| Redact and link evidence reference | security-lead | 2026-07-19 | redacted reference |
| Decide whether reseal is required | release-engineer | 2026-07-19 | PH-13B rerun if artifacts changed |

## Intake Outcomes

- Go: proceed to human-controlled target smoke and change execution.
- No-go: apply the no-go quarantine plan.
- Conditional go: record accepted risks, conditions, owners, and deadlines.

## Boundary

`HUMAN_APPROVALS_STILL_PENDING`

This playbook is ready for use, but the board has not yet acted. No production action is authorized here.

## Intake Checklist

| Check | Owner | Required before repository update |
|---|---|---|
| Decision was made by human board | release-chair | yes |
| Sensitive evidence was redacted | security-lead | yes |
| Change ticket exists externally | release-manager | yes |
| Release candidate seal was verified before decision | release-engineer | yes |
| If artifacts changed, reseal was completed | release-engineer | yes |

If any checklist item is missing, the decision cannot be reflected in repository metadata and must remain external/pending.
