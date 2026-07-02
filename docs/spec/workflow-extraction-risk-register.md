# Workflow Extraction Risk Register (PH-00A)

| ID | Risk | Severity | Evidence | Mitigation / Owner Gate |
|---|---|---:|---|---|
| R1 | HRMS person hierarchy resolver is absent in PUDA. | Critical | B1/B2/D1 in `docs/spec/puda-vs-hrms-capability-gap.md`; PUDA routing scan shows hierarchy/reporting terms all zero. | PH-00B must build ApproverResolver SPI and HRMS hierarchy/statutory resolver before HRMS feature work. |
| R2 | Workflow core has PUDA/LAC domain side effects embedded. | High | `apps/api/src/workflow.ts:1296-1319`, `apps/api/src/workflow.ts:1926-2025`; `apps/api/src/workflow-action-catalog.ts:60-103`. | Facade and action/document/notification adapters before extraction. |
| R3 | Repository license/provenance is unclear. | High | No repository LICENSE or package license fields found; only service-pack license path found. | Legal/source approval before separate reusable package or distribution. |
| R4 | PUDA worktree is dirty at characterization time. | Medium | `git status --short` shows 10 modified and 14 untracked files. | Freeze a PH-00B branch/tag and rerun baseline from a clean checkout. |
| R5 | Committed Vitest config does not start cleanly under default runtime. | Medium | `ERR_REQUIRE_ESM` loading `std-env/dist/index.mjs` from committed config. | Normalize Node/Vitest versions or config before making golden suite a CI gate. |
| R6 | Aggregate golden corpus has current failures. | Medium | `workflow.output-template-parity.test.ts` and `workflow-branch-aware-stages.test.ts` failed in aggregate run. | Fix in PUDA or quarantine as PUDA-domain failures; do not block facade design but block extraction release. |
| R7 | Test DB/sandbox isolation is not formalized. | Medium | Aggregate API tests hit local Fastify/DB paths and were manually interrupted. | Create disposable DB/test harness before PH-00B golden gate. |
| R8 | HRMS multi-tenancy is stronger than PUDA authority scoping. | High | PUDA `application` has `authority_id`: `apps/api/migrations/002_complete_schema.sql:216-235`; HRMS requires tenant/entity isolation: `docs/platform-grounding/extracts/platform_spec.txt:17`. | Add tenant/entity scoping at facade/repository layer; do not expose raw PUDA queries. |
| R9 | Idempotency-key semantics are only partial. | Medium | PUDA uses row locks: `apps/api/src/workflow.ts:1176-1185`; HRMS requires idempotency keys: `docs/platform-grounding/extracts/platform_spec.txt:20`, `docs/platform-grounding/extracts/platform_spec.txt:30`. | Facade owns idempotency table and action de-duplication. |
| R10 | UI reuse may overfit PUDA process vocabulary. | Low | Officer UI tests pass for role/queue swimlanes, not HRMS hierarchy swimlanes. | Treat PUDA UI as reference; design HRMS workflow console after facade vocabulary freezes. |
