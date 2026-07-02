# PH-12 Rollback Authorization Template

Marker: `ROLLBACK_AUTHORIZATION_TEMPLATE`

This template prepares rollback authority for a human-controlled release window. It does not execute rollback and does not authorize rollback by itself. Rollback execution remains `ROLLBACK_EXECUTION_HUMAN_REQUIRED`.

## Authorization Fields

| Field | Human entry required |
|---|---|
| Release identifier | human entry required |
| Rollback commander | ops-lead unless release board assigns another owner |
| Release chair | release-chair |
| Trigger condition | human entry required |
| Start time | human entry required |
| Communication bridge | human entry required |
| Systems affected | human entry required |
| Data preservation confirmation | human entry required |

## Rollback Guardrails

| Guardrail | Owner | OWNER_DATE | State |
|---|---|---|---|
| Preserve Service Register facts | module-owner | module-owner / 2026-07-19 | required |
| Preserve audit/security audit logs | security-lead | security-lead / 2026-07-19 | required |
| Do not unlock payroll periods without compensation approval | compensation-lead | compensation-lead / 2026-07-19 | required |
| Do not reissue pension/PPO facts without business acceptance | compensation-lead | compensation-lead / 2026-07-19 | required |
| Stop before destructive database operation unless separately approved | ops-lead | ops-lead / 2026-07-19 | required |

## Execution Boundary

The board may assign rollback authority, but actual execution requires an active incident or release-day decision. The agentic pipeline can verify this template exists; it cannot execute rollback, change infrastructure, or authorize production operations.

