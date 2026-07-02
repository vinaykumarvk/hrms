# PH-11 Operational RACI

Marker: `OPERATIONAL_RACI`

This RACI defines accountable owners for release-day and hypercare operations. It is prepared before go-live and remains conditional on human release approval. PH-11 does not authorize production cutover; it records governance readiness with `GO_LIVE_HUMAN_APPROVAL_PENDING`.

## Release-Day RACI

| Activity | Responsible | Accountable | Consulted | Informed | Date |
|---|---|---|---|---|---|
| Final UAT decision | business-owner | release-chair | module owners | program team | 2026-07-19 |
| Release freeze confirmation | release-manager | release-chair | engineering leads | support team | 2026-07-19 |
| Production deployment execution | ops-lead | release-chair | security-lead, release-lead | business-owner | 2026-07-19 |
| Rollback decision | ops-lead | release-chair | security-lead, module owner | business-owner | 2026-07-19 |
| Incident bridge command | ops-lead | service-manager | support-lead, security-lead | all stakeholders | 2026-07-20 |
| Data or SR correction approval | module-owner | business-owner | audit-lead | support team | 2026-07-20 |

## Operational Ownership

Marker: `SLA_OWNERS`

| Domain | Owner | Backup | SLA link | Date |
|---|---|---|---|---|
| Workflow routing and task queues | workflow-lead | support-lead | P2 workflow failure | 2026-07-20 |
| Tenant isolation and security audit | security-lead | audit-lead | P1 security incident | 2026-07-20 |
| Payroll and pension facts | compensation-lead | finance-support-lead | P1/P2 compensation issue | 2026-07-20 |
| Migration exceptions and coexistence | migration-lead | data-lead | P2 migration issue | 2026-07-20 |
| Analytics and dashboard evidence | analytics-lead | reporting-lead | P3 reporting issue | 2026-07-20 |

## Incident Severity Matrix

Marker: `INCIDENT_SEVERITY_MATRIX`

P1 incidents are security, payroll, pension, SR integrity, or tenant-isolation failures and require immediate bridge activation. P2 incidents affect a core workflow or statutory process but have a controlled workaround. P3 incidents are reporting, cosmetic, training, or documentation issues. Every incident must include owner/date evidence: `RISK_OWNER_DATE`.

## Human Approval Boundary

The accountable owner may approve or reject go-live only in the release board meeting. An agentic pipeline can verify this RACI exists; it cannot sign for any accountable human role.

