# PH-10 Rollback Plan

Marker: `ROLLBACK_PLAN`

The rollback plan preserves operational HRMS first. G14 analytics is isolated enough to disable independently if marts, dashboards, or data-health checks misbehave.

## Rollback Triggers

| Trigger | Action | Owner | Date |
|---|---|---|---|
| Analytics scope leak | Disable `/api/v1/analytics/*`, keep transactional modules online | analytics-lead | 2026-07-02 |
| Payroll or pension regression | Disable PH-10 dashboard consumption and keep PH-09 facts locked | compensation-lead | 2026-07-02 |
| Migration reconciliation mismatch | Stop promotion, keep staging rows read-only | migration-lead | 2026-07-02 |
| Security incident | Revoke affected role/policy and preserve audit evidence | security-lead | 2026-07-02 |
| Deployment instability | Roll back web/API artifacts to previous signed build | ops-lead | 2026-07-02 |

## Recovery Steps

1. Announce incident bridge and assign incident commander.
2. Disable analytics routes or feature flag G14 if the incident is analytics-only.
3. Revert application artifact if operational modules are impacted.
4. Restore from verified backup only after human operations approval.
5. Re-run `npm run check`, `npm run web:check`, migration reconciliation, and G14 mart refresh.
6. Record residual risk with owner/date before resuming cutover.

Rollback execution is a human-controlled operation. Development evidence only confirms the plan exists and is test-referenced.

## Data Handling During Rollback

- Do not delete Service Register rows. Corrections must be appended through source-owned reversal or corrigendum routes.
- Do not unlock already locked payroll periods without compensation-owner approval.
- Do not reissue PPO numbers during rollback; keep the original PPO fact and append corrective evidence after review.
- Preserve audit/security audit logs before redeployment.
- Keep migration staging rows intact until the reconciliation owner marks the exception closed.
