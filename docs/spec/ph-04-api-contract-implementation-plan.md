# PH-04 Detailed Plan — API Contracts for Platform and Foundation Modules

Status: pipeline-ready plan, not executed.

## Objective

Expose stable `/api/v1` API surfaces for P01 workflow, G01 employee master, G12 Service Register, and G13 document vault using the PH-03 service layer. PH-04 binds service internals to route handlers, enforces the shared API contract, and proves auth, idempotency, pagination, correlation IDs, and error-envelope behavior before PH-05 UI work begins.

## Entry Conditions

- PH-03 foundation services are available: `createFoundationServices`, P01 workflow, authority resolver, P02 authorization, P05 audit, G01, G12, G13, jobs, notifications, and migration staging.
- Existing OpenAPI contracts parse:
  - `docs/contracts/openapi/P01-workflow.yaml`
  - `docs/contracts/openapi/G01.yaml`
  - `docs/contracts/openapi/G12.yaml`
  - `docs/contracts/openapi/G13.yaml`
- Existing error taxonomy remains the source of truth for the canonical 8 wire codes.

## Non-Goals

- No PH-05 UI work.
- No G03/G05 vertical-slice module logic.
- No production object storage, KMS, AV scan, eSign, RFC 3161, or external integration implementation.
- No new API/auth/error-code policy unless explicitly recorded and approved.
- No direct database-backed route implementation unless it preserves PH-03 service boundaries.

## Subphase Breakdown

| Subphase | Gate | Purpose | Main Outputs |
|---|---|---|---|
| PH-04A | auto | API kernel and contract harness | request/response kernel, route registry, auth guard, correlation, error envelope, idempotency, pagination, OpenAPI registry |
| PH-04B | auto | P01 and G01 routes | workflow routes and employee master/governed-change routes wired to PH-03 services |
| PH-04C | auto | G12 and G13 routes | SR ingest/timeline/corrigendum/dispute and document create/attach/version/hold/retention routes |
| PH-04D | human after GREEN | API conformance and freeze | OpenAPI smoke, auth, idempotency, pagination, error-envelope tests, PH-04 verdict, manifest evidence |

PH-04D is human-gated because it freezes the API surface that PH-05 and later module waves consume. The executable gate must be GREEN first; the human review is for API-surface freeze and any contract-delta acceptance.

## Minimum Route Set

P01:
- `POST /api/v1/workflow/instances`
- `POST /api/v1/workflow/instances/{instance_id}/advance`
- `POST /api/v1/workflow/instances/{instance_id}/approve`
- `POST /api/v1/workflow/instances/{instance_id}/reject`
- `POST /api/v1/workflow/instances/{instance_id}/send-back`
- `POST /api/v1/workflow/instances/{instance_id}/delegate`
- `POST /api/v1/workflow/instances/{instance_id}/cancel`
- `POST /api/v1/workflow/instances/{instance_id}/query`
- `GET /api/v1/workflow/instances/{instance_id}`
- `GET /api/v1/workflow/tasks`

G01:
- `GET /api/v1/employees`
- `GET /api/v1/employees/{id}`
- `GET /api/v1/employees/{id}/profile-360`
- `GET /api/v1/employees/changes`
- `GET /api/v1/employees/{id}/governed-changes`
- `POST /api/v1/employees/{id}/governed-changes`
- `POST /api/v1/governed-changes/{id}:approve`
- `POST /api/v1/governed-changes/{id}:reject`

G12:
- `POST /api/v1/sr/ingest`
- `POST /api/v1/sr/ingest/reversal`
- `GET /api/v1/sr/ingest/{ingestion_request_id}`
- `GET /api/v1/sr/employees/{id}/timeline`
- `GET /api/v1/sr/events/{id}`
- `POST /api/v1/sr/events/{id}/corrigendum`
- `POST /api/v1/sr/events/{id}/dispute`
- `POST /api/v1/sr/disputes/{id}/resolve`

G13:
- `POST /api/v1/documents`
- `GET /api/v1/documents`
- `GET /api/v1/documents/{id}`
- `POST /api/v1/documents:attach`
- `GET /api/v1/documents/{id}/versions`
- `POST /api/v1/documents/{id}:checkin`
- `POST /api/v1/documents/{id}:supersede`
- `POST /api/v1/legal-holds`
- `POST /api/v1/legal-holds/{id}:approve-placement`
- `POST /api/v1/legal-holds/{id}:release`
- `GET /api/v1/documents/{id}/retention`
- `POST /api/v1/documents/{id}:extend-retention`

## Cross-Cutting Requirements

- Every route is explicitly protected unless marked public in code.
- Every protected route calls P02 `Authorization.check`.
- Unsafe POSTs require `Idempotency-Key`.
- Every request/response carries `X-Correlation-Id`.
- Every error uses the canonical envelope from `docs/contracts/error-taxonomy.yaml`.
- No stack traces, local paths, secret IDs, tokens, or PII values in API responses.
- List routes use cursor pagination with `limit` default 25 and max 100.
- P02 non-leakage: forbidden/out-of-scope records must not reveal existence.
- API handlers call PH-03 services; they must not bypass G01/G12/G13 ownership boundaries.

## Testing Plan

- API kernel tests:
  - missing/invalid auth returns canonical `UNAUTHENTICATED`/`FORBIDDEN`;
  - correlation ID is generated/echoed;
  - unsafe POST without `Idempotency-Key` fails;
  - list `limit > 100` clamps or rejects per contract;
  - internal errors sanitize to `INTERNAL`.
- P01/G01 route tests:
  - workflow start creates task and audit evidence;
  - approve/reject/send-back/delegate/cancel/query return canonical responses;
  - employee list/detail/profile read uses P02 masking;
  - governed change posts through G01 and G12.
- G12/G13 route tests:
  - duplicate SR ingest returns original result;
  - semantic duplicate is not appended;
  - source reversal appends a reversal event;
  - document attach records module reference;
  - legal hold blocks disposal/release behavior is enforced.
- Conformance tests:
  - OpenAPI YAML parse;
  - implemented route registry matches the minimum route set above;
  - every route has auth metadata;
  - every list route has pagination metadata;
  - every unsafe route has idempotency metadata;
  - `npm run check` passes.

## Rollback and Quarantine

- Rollback: disable route registration per module behind a route registry flag while preserving PH-03 services.
- Retry: fix one route group at a time and rerun the matching PH-04 subphase oracle.
- Quarantine: a failed G13 route group must not block P01/G01/G12 route implementation; a failed API kernel blocks all route groups.

## Human Gate

PH-04D parks after GREEN for human API-freeze approval when:
- OpenAPI files changed;
- error taxonomy changed;
- auth/RBAC behavior changed;
- any route is deliberately deferred from the minimum route set;
- contract compatibility is accepted with known caveats.

## Check-Authoring Gap

- No PH-04 subphase uses `exit_criteria: true`; all PH-04 gates have executable shell oracles.
- PH-04A/B/C are `gate: auto` because their checks are structural plus build/test based.
- PH-04D is `gate: human` even after GREEN because API compatibility is a program-level freeze decision before PH-05.
- Current pipeline state shows PH-04A blocked on PH-03C until PH-03C is completed and approved.
- The PH-04 checks are expected to fail until PH-04 is implemented; they are future oracles, not current completion evidence.
