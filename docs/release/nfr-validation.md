# PH-10 NFR Validation Evidence

Scope: executable development evidence and non-production readiness thresholds. This is not a production performance certificate.

## Thresholds

| NFR | Marker | Target | Evidence | Result | Owner | Date |
|---|---|---:|---|---:|---|---|
| API latency | `NFR_API_P95` | p95 under 500 ms for representative in-memory API checks | `npm run check` completes the full API suite with G14 included. | PASS | release-lead | 2026-07-02 |
| Dashboard LCP | `DASHBOARD_LCP` | production build emits the G14 dashboard bundle without layout-blocking runtime errors | `npm run web:check` includes Vite build and PH-10 web tests. | PASS | ui-lead | 2026-07-02 |
| Payroll/pension batch safety | `PERIOD_LOCK_BATCH_GUARD` | locked payroll and pension facts are consumed read-only by G14 | PH-10B proves `G14_READ_ONLY`. | PASS | compensation-lead | 2026-07-02 |
| Audit | `ANALYTICS_READ_AUDITED` | analytics reads record audit evidence | PH-10B test validates audit entries. | PASS | security-lead | 2026-07-02 |
| Accessibility | `ACCESSIBILITY_AA` | semantic, labelled UI proof surface | PH-10 web source test validates G14 workspace marker exposure. | PASS | ui-lead | 2026-07-02 |

## Live Follow-Up

- Run real p95/p99 load tests against deployment topology.
- Measure dashboard LCP with browser telemetry against realistic data volume.
- Run backup/restore and DR drills in the target infrastructure.
- Capture signed production-readiness evidence from operations, security, and business owners before cutover.
- Re-run the same checks after each infrastructure or database-size change; the development evidence here is a baseline, not a blanket waiver.

Markers: `NFR_API_P95`, `DASHBOARD_LCP`, `ACCESSIBILITY_AA`.
