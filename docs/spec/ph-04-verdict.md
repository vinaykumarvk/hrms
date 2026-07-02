# PH-04 Verdict — API Conformance and Freeze Packet

Date: 2026-07-02 (re-baselined after `docs/reviews/brd-coverage-audit-20260702.md`)
Branch: `ph02-rerun`
Oracle: `bash docs/spec/pipeline/checks/ph-04d.sh` (independent registry-vs-contract diff; numbers below are copied verbatim from its output)

## 1. What this packet is — and is not

This is a **CONTRACT-DIRECTION freeze packet**, not a contract-completion claim. PH-04 froze the
API *conventions and route shapes* (base path, auth, error envelope, idempotency, pagination,
correlation) and implemented a narrow set of foundation routes over the PH-03 in-memory services.
It did **not** implement the full OpenAPI contract package. The oracle's own computation makes the
scale explicit: **3.6%** of all OpenAPI operations are implemented. The previous verdict on this
file self-certified via marker greps; this packet replaces it with the oracle's numbers.

## 2. Oracle-computed contract coverage (verbatim)

Overall, as printed by the oracle:

```
contract coverage computed: 3.6% of OpenAPI operations implemented
drift: 0 implemented route(s) not in any contract
```

unmatched_implemented: 0

Per-contract rows (oracle output, verbatim):

| Contract | Oracle row (implemented/total operations) |
|---|---|
| G01 | 9/165 operations implemented (5.5%) |
| G02 | 0/65 operations implemented (0.0%) |
| G03 | 0/92 operations implemented (0.0%) |
| G04 | 2/45 operations implemented (4.4%) |
| G05 | 2/75 operations implemented (2.7%) |
| G06 | 2/86 operations implemented (2.3%) |
| G07 | 1/111 operations implemented (0.9%) |
| G08 | 1/133 operations implemented (0.8%) |
| G09 | 1/89 operations implemented (1.1%) |
| G10 | 2/87 operations implemented (2.3%) |
| G11 | 2/90 operations implemented (2.2%) |
| G12 | 8/65 operations implemented (12.3%) |
| G13 | 13/114 operations implemented (11.4%) |
| G14 | 0/90 operations implemented (0.0%) |
| P01-workflow | 4/16 operations implemented (25.0%) |

Measurement caveat (stated, not corrected): the oracle parses literal `kernel.register({...})`
blocks with string-literal `method:`/`path:` fields. In `apps/api/src/routes/p01-workflow.routes.ts`
the 11 instance-level P01 routes (POST /workflow/instances, GET /workflow/tasks,
GET /workflow/instances/{instance_id}, and the 7 instance action routes built from a template-literal
path) are registered through an array + `routes.forEach(kernel.register)` and a path template, so the
parser cannot see them. They ARE registered at runtime and are exercised by the PH-04 tests
(start → list → approve). The P01-workflow row above is therefore an undercount by construction of
the measurement, and the oracle's number is reported unchanged. This does not change the overall
conclusion: coverage is a small single-digit percentage either way.

## 3. Drift and contract amendments (disposition of every drift route)

The oracle initially reported 5 implemented routes in no contract. All 5 were resolved by
**contract amendment on 2026-07-02** (recording implemented PH-04B/PH-04C route shapes in the
contracts, not by changing app code), bringing drift to the `unmatched_implemented: 0` above:

| Formerly drifting route | Disposition |
|---|---|
| POST /workflow/tasks/{task_id}/claim | Amended into `docs/contracts/openapi/P01-workflow.yaml` (operationId `claimWorkflowTask`) |
| POST /workflow/tasks/{task_id}/approve | Amended into `docs/contracts/openapi/P01-workflow.yaml` (operationId `approveWorkflowTask`) |
| POST /workflow/tasks/{task_id}/reject | Amended into `docs/contracts/openapi/P01-workflow.yaml` (operationId `rejectWorkflowTask`) |
| POST /workflow/tasks/{task_id}/delegate | Amended into `docs/contracts/openapi/P01-workflow.yaml` (operationId `delegateWorkflowTask`, new `TaskDelegateRequest` schema) |
| GET /documents/{id}/retention | Amended into `docs/contracts/openapi/G13.yaml` (`get` added beside the existing `post` on `/documents/{id}/retention`, operationId `getRetention`) |

Each amendment is annotated in the contract file with `Contract amendment 2026-07-02 (PH-04D freeze
packet)`. The task-level workflow action routes are a deliberate PH-04B convention (task inbox acts on
tasks, not instances); the amendment records that convention so the freeze covers routes that actually
exist.

## 4. What PH-04A/B/C actually delivered (evidence)

All 4 PH-04 test files pass: **21 PH-04 tests** inside the full API suite of **133 passing tests**
(`npm test`, 0 fail). Typecheck passes.

- **PH-04A — API kernel** (`apps/api/test/ph04-api-kernel.test.cjs`, 5 tests): route registry across
  all 14 modules + P01; every route explicitly protected with a named permission and
  `Authorization.check` before the handler; sanitized canonical error envelope (internal errors
  reduced to `INTERNAL` / "Request failed"); a **working Idempotency-Key replay store** (same key
  returns the same stored response); real cursor pagination helper (default 25, max 100,
  `next_cursor`); `X-Correlation-Id` echo/generation.
- **PH-04B — P01 workflow + G01 employee** (`apps/api/test/ph04-p01-g01-routes.test.cjs`, 6 tests):
  G01 employee **create** (FR-EPM-001) plus list/detail/profile-360 with P02 field masking; a real
  `/changes` feed (no longer hardcoded `[]`); **governed change decisions** — `:approve`/`:reject`
  execute real decisions and post to the G12 SR ledger (no echo stubs); **task-level workflow
  routes** claim/approve/reject/delegate over the PH-03 hierarchy resolver.
- **PH-04C — G12 + G13** (`apps/api/test/ph04-g12-g13-routes.test.cjs`, 7 tests): G12 timeline with
  **real cursor paging** (bounded limits, non-hardcoded `next_cursor`); G12 **reversal honouring the
  BRD `is_reversal` envelope**; idempotent ingest replay and semantic dedup; G13
  **`:fetch?intent=VIEW|DOWNLOAD`** (FR-G13-016) and **DI-14 attach-target validation**; legal-hold /
  retention fail-closed behaviour.
- **PH-04D — conformance regression** (`apps/api/test/ph04-contract-conformance.test.cjs`, 3 tests):
  frozen minimum route set present; all routes protected + permissioned; unsafe routes require
  Idempotency-Key; canonical error/auth/idempotency/pagination/correlation behaviour stable.

Everything runs in-process over PH-03 in-memory services: no production HTTP server, no SQL
repositories, no object storage/AV/eSign adapters.

## 5. Named gaps — what is NOT implemented, and which phase owns it

Grounded in the oracle rows above and `docs/reviews/brd-coverage-audit-20260702.md` (~84% of BRD
line items NOT_FOUND). Per module, the missing operation families and the owning phase:

| Module | Not implemented (operation families) | Owner |
|---|---|---|
| P01 | wait/timer satisfy, references fan-out; maker-checker/SoD, parallel topologies, SLA/escalation depth | PH-05C (inbox UI consumption); topology depth across module waves |
| G01 | satellite-entity CRUD (service history, qualifications, family, postings…), outbox events — 156/165 ops missing | PH-07A, PH-07E |
| G02 | entire personal-details workflow surface (65/65 missing): field catalogues, verification, bulk ops | PH-07C |
| G03 | entire attendance/leave surface (92/92 missing): calendars, accrual/carry-forward, encashment, regularisation | PH-06B, PH-07D |
| G04 | relay/DLQ administration beyond enqueue+ingest (43/45 missing) | PH-07B |
| G05 | transfer administration depth (73/75 missing): requests, panels, clearance matrices | PH-06C, PH-08B |
| G06 | promotion/DPC/MACP/sanctioned-posts/QSL/roster (84/86 missing) | PH-08A, PH-08C |
| G07 | training catalogue, sessions, feedback, budgets (110/111 missing) | PH-08D |
| G08 | APAR forms, workflows, gradation, representation (132/133 missing) | PH-08D |
| G09 | natural-justice chain: PI, suspension, show-cause, consultation, POSH (88/89 missing) | PH-08E |
| G10 | payroll rate tables/DSL, proration/LWP, arrears, TDS/PT, bank file, GL (85/87 missing) | PH-09A, PH-09B, PH-09D |
| G11 | scheme branching OPS/NPS/UPS, commutation, family pension, GPF, disbursement (88/90 missing) | PH-09C |
| G12 | real SHA-256 chain, verify endpoint, attestation, §65B/LTV, anchor/status-chain (57/65 missing) | PH-10A, PH-10B |
| G13 | scan/OCR, e-sign, search/reindex, disposition SoD, KMS/clearance/DPDP, shares/redaction (101/114 missing) | PH-10A, PH-10C |
| G14 | the whole analytics engine: KPI engine, bitemporal, suppression, scope-policy, 24-table DDL consumption (90/90 missing) | PH-10D, PH-10E |

Cross-cutting (audit): persistence (SQL data model largely unconsumed — PH-06A onwards), all module
UIs (PH-05, then per-wave UI sub-phases), module `ERR-Gxx-*` error codes, scheduled jobs
(`JOB-Gxx-*`), and statutory notifications remain missing across modules.

## 6. Recommendation to the human gate

**Approve a CONTRACT-DIRECTION freeze only.** Concretely:

1. **Freeze the conventions**: `/api/v1` base path, protected-by-default routes with named
   permissions, canonical error envelope and taxonomy codes, `Idempotency-Key` replay semantics,
   cursor pagination (25/100/`next_cursor`), `X-Correlation-Id`. These are implemented, tested (133
   green tests), and safe for PH-05 UI work to consume.
2. **Freeze the implemented route shapes** (the 47 matched operations plus the P01 runtime-registered
   instance routes), including the 5 route shapes recorded by the 2026-07-02 contract amendments.
3. **Do NOT record this as contract implementation.** At 3.6% oracle-computed operation coverage,
   approving PH-04 as "the API is built" would repeat the exact failure the audit found. The
   remaining ~96% of operations are explicitly owned by PH-05..PH-10 as tabled above, each behind
   its own oracle and human gate.
4. Re-verify SQL persistence, RLS, and the production HTTP server when PH-06A replaces the in-memory
   fixtures — the frozen shapes must survive that substitution unchanged.

Residual risks: in-process handlers only (no deployed server); the oracle's registry parser
undercounts array-registered routes (Section 2 caveat); G13 production adapters (object storage,
KMS, AV, WORM, timestamping) are future work; contract totals include operation families whose
statutory design decisions (G10/G11/G09) are still open.
