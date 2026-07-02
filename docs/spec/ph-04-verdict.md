# PH-04 Verdict - API Contracts for Platform and Foundation Modules

Status: GREEN by implementation evidence; pending the configured human API-freeze decision at PH-04D.

## Verdict

PH-04 binds the PH-03 foundation services to stable `/api/v1` API route groups for P01 workflow, G01 employee master, G12 Service Register, and G13 document vault.

Contract delta status: no contract delta. The implementation did not change the OpenAPI contract files or the canonical error taxonomy. The route registry implements the PH-04 minimum route set from `docs/spec/ph-04-api-contract-implementation-plan.md`.

Recommended gate disposition: proceed to human API-freeze approval for PH-04D. After approval, PH-05 can consume the route registry and response shapes.

## Implemented Surface

- API kernel and registry: `apps/api/src/http/*`, `apps/api/src/openapi/*`.
- P01 workflow routes: `apps/api/src/routes/p01-workflow.routes.ts`.
- G01 employee routes: `apps/api/src/routes/g01.routes.ts`.
- G12 Service Register routes: `apps/api/src/routes/g12.routes.ts`.
- G13 document vault routes: `apps/api/src/routes/g13.routes.ts`.
- Route composition: `apps/api/src/routes/index.ts` via `createFoundationApi()`.

The implementation remains in-process for PH-04. It proves contract behavior and route conformance over the PH-03 service layer; it does not introduce a production web server, SQL repositories, object storage, AV, eSign, or external integrations.

## Cross-Cutting Evidence

Auth: every registered route is protected and carries a permission. The kernel invokes `Authorization.check` before the handler runs. Tests cover unauthenticated and forbidden responses.

Idempotency: unsafe POST routes require `Idempotency-Key` at the kernel layer. Tests cover missing-key rejection and G12 idempotent replay.

Pagination: list routes expose cursor pagination metadata with default limit 25, maximum 100, and `next_cursor`. Tests prove `limit=250` is bounded to 100.

Correlation: every response carries `X-Correlation-Id`; inbound correlation IDs are echoed and missing ones are generated.

Error envelope: all failures are converted to the canonical envelope with `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `PRECONDITION_FAILED`, `RATE_LIMITED`, and `INTERNAL`. Internal errors are sanitized to `INTERNAL` with message `Request failed`.

## Route-Group Evidence

P01: workflow start, task list, instance read, and action routes for advance, approve, reject, send-back, delegate, cancel, and query are registered. Tests prove start -> list -> approve over the PH-03 hierarchy resolver.

G01: employee list/detail/profile-360, employee changes, governed changes, and approve/reject decision routes are registered. Tests prove pagination, P02 masking through `fieldGrants`, and G01 governed identity change posting through G12 SR ingest.

G12: ingest, reversal, ingest lookup, timeline, event read, corrigendum, dispute, and dispute resolution are registered. Tests prove idempotent replay, semantic dedup, reversal append, and manual SR annotations.

G13: document create/list/read, attach, versions, checkin, supersede, legal-holds, and retention routes are registered. Tests prove create, attach, legal hold, retention fail-closed state, and blocked checkin under legal hold.

## Checks

- `npm run check`: passed with TypeScript typecheck, build, and 61 Node test subtests.
- `bash docs/spec/pipeline/checks/ph-04a.sh`: expected GREEN after manifest update.
- `bash docs/spec/pipeline/checks/ph-04b.sh`: expected GREEN after manifest update.
- `bash docs/spec/pipeline/checks/ph-04c.sh`: expected GREEN after manifest update.
- `bash docs/spec/pipeline/checks/ph-04d.sh`: expected GREEN machine oracle, then human API-freeze gate.

## Residual Risks

- The routes are in-process contract handlers, not a deployed HTTP server.
- SQL-backed repositories and database RLS must be re-proven when persistence replaces the current in-memory service fixtures.
- G13 production adapters for object storage, KMS, AV scan, WORM storage, and timestamping remain future adapter work.
- The PH-04D human gate should review API names and response shapes before PH-05 UI work consumes them.
