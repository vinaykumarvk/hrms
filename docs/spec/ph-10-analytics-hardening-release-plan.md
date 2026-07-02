# PH-10 Analytics, Enterprise Hardening, and Release Readiness Plan

PH-10 closes the current HRMS build by adding G14 read-only analytics and the enterprise evidence pack needed before real UAT, deployment, and production cutover decisions. It builds on PH-09 compensation facts and does not mutate transactional modules.

The phase remains inside the modular monolith. Analytics reads from existing in-memory service state and materializes deterministic marts in process for testability. Real read replicas, data warehouses, production observability stacks, and live backup infrastructure remain deployment work, but PH-10 creates executable evidence and runbooks that define how those controls must be operated.

PH-10 does not perform production cutover, destructive migration, real restore into production, live security scans against external systems, or credentialed deployment. Those remain human-controlled release actions. The PH-10 deliverable is release readiness, not go-live approval.

| Step | Gate | Scope | External oracle |
|---|---:|---|---|
| PH-10A | auto | Freeze PH-10 detailed plan, prompts, executable checks, pipeline wiring, G14 OpenAPI binding marker, and phased-plan evidence note. | `bash docs/spec/pipeline/checks/ph-10a.sh` |
| PH-10B | auto | Implement G14 read-only analytics marts, dashboard APIs, role/scope enforcement, drill-through authorization, PII suppression, mart refresh idempotency, and read audit. | `bash docs/spec/pipeline/checks/ph-10b.sh` |
| PH-10C | auto | Implement migration dry-run/certification evidence and hardening evidence for security, NFRs, dependency/secrets, backup/restore, audit, and accessibility. | `bash docs/spec/pipeline/checks/ph-10c.sh` |
| PH-10D | auto | Create deployment runbook, rollback plan, coexistence plan, UAT scripts, release evidence pack, and explicit human cutover-approval requirement. | `bash docs/spec/pipeline/checks/ph-10d.sh` |
| PH-10E | auto | Add G14 UI proof, PH-10 verdict, manifest evidence, state files, and full API/web regression coverage. | `bash docs/spec/pipeline/checks/ph-10e.sh` |

## Scope Rules

- G14 is read-only. It must not call mutating service methods or Service Register ingest.
- Analytics uses P02/RLS scope from the caller. Cross-tenant or cross-entity rows must not appear in dashboard or drill-through responses.
- PII suppression is mandatory. Analytics outputs must not expose PAN, Aadhaar, tokens, secrets, or stack traces.
- Every analytics read is audited with `ANALYTICS_READ_AUDITED`.
- Mart refresh is deterministic and idempotent with marker `MART_REFRESH_IDEMPOTENT`.
- Drill-through must be separately authorized and emit `DRILL_THROUGH_AUTHZ`.
- Migration dry runs remain staging/certification only. No production system-of-record mutation is allowed.
- Release documents must include owners, dates, rollback, migration exception disposition, UAT scripts, and human cutover approval requirements.
- PH-10 proves representative enterprise readiness controls. It is not a substitute for live production security review, infrastructure restore, user sign-off, or go-live CAB approval.

## Evidence

- `apps/api/src/modules/g14/analyticsService.ts`
- `apps/api/src/routes/g14.routes.ts`
- `apps/api/src/migration/ph10MigrationDryRun.ts`
- `apps/api/test/ph10-g14-analytics.test.cjs`
- `apps/api/test/ph10-hardening-migration.test.cjs`
- `apps/api/test/ph10-release-evidence.test.cjs`
- `apps/web/src/modules/g14/AnalyticsWorkspace.tsx`
- `apps/web/test/ph10-analytics-release.test.cjs`
- `docs/release/*`
- `ops/*`
- `docs/spec/ph-10-verdict.md`

## Exit Position

PH-10 is complete when G14 has executable read-only analytics, route/API proof, mart idempotency proof, scope-leak and PII-suppression tests, migration dry-run certification evidence, hardening and NFR evidence, release runbooks, rollback/UAT/coexistence evidence, UI proof, and full API/web regression. Production/UAT/cutover approval remains an explicit human gate outside this development pipeline.
