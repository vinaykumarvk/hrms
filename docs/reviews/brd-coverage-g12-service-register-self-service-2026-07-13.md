# BRD Coverage Review — G12 Service Register Self-Service Timeline (use-case scoped)

Date: 2026-07-13
BRD under review: `docs/brd/v3/G12-digital-service-register.md` — **scoped subset only**
Scope decision (same principle as prior use cases): "access service register / employment history —
postings, promotions, service record timeline." Covers FR-09 (timeline view) only — not the
event-ingestion/writer side (already implemented, tested, used by many modules), not corrections/
disputes/corrigendum workflows, not certified-extract issuance, not confidence/reconstruction
badges.

Verdict: **GAPS-FOUND** (the core self-scope gap — a real, cited security gap — is remediated;
one BRD-cited requirement, the access-log-on-read (AC5), is deferred)

## In-scope requirement

**FR-09 — SR Timeline View (chronological, filterable)**

## What changed this session

- Backend: `apps/api/src/modules/g12/serviceRegisterService.ts` — `getTimeline()` had **zero**
  self-scope enforcement (any actor holding `g12.sr.read` could view any employee's SR timeline).
  Added `assertSelfOrOverride`-equivalent logic inline (self or `SR_TIMELINE_OVERRIDE_ROLES`:
  hr_admin, manager, auditor, sr_custodian, system, or wildcard `*`), matching BR-09.1
  "self/scoped/auditor visibility." Signature changed from `(scope: TenantScope, employeeId)` to
  `(actor: ActorContext, employeeId)`.
- Updated the 2 non-route internal callers to pass an actor instead of a bare scope:
  `apps/api/src/modules/g12/srIntegrityService.ts` (certified-extract issuance — already had an
  `actor` param in scope, just wasn't using it here) and confirmed
  `apps/api/src/modules/g04/leaveSrRelayService.ts`'s reconciliation caller already passed a full
  actor. `apps/api/src/routes/g12.routes.ts`'s timeline route updated to pass `context.actor`
  instead of `context.scope`.
- **Blast radius check**: `getTimeline()` is called from ~25 call sites across `apps/api/test/*.test.cjs`
  spanning G01/G02/G03/G04/G05/G06/G07/G08/G09/G11 test files, plus 2 `.test.ts` files colocated
  under `apps/api/src/modules/`. Sampled 6+ of the widest-spread callers' `actor()` helpers — all use
  wildcard `permissions: ["*"]`, which the new override check honors. Full suite run confirmed
  **zero regressions** (615/616 → 619/620 after adding this session's own new tests; the 1 skip is
  pre-existing and unrelated). The 2 `.test.ts` files aren't wired into `npm test` at all (a
  pre-existing, unrelated gap in the test-runner configuration) but were manually compiled and run
  to confirm no regression there either.
- Frontend: `apps/web/src/App.tsx` — the `/me/service-register` route now passes
  `employeeId={sessionEmployeeId}` to `ServiceRegisterTimeline` (previously passed no employeeId at
  all, so the component silently defaulted to "first employee in the tenant" via its own fallback —
  the same bug class fixed for `MyPayslipsPanel` in the prior use case). Unlike the payslips panel,
  `ServiceRegisterTimeline`'s optional-employeeId fallback was **not removed** here: FR-09 explicitly
  names multiple legitimate viewer roles (HR Officer, SR Custodian, Auditor, Pension Officer) beyond
  the employee themselves, so a generic default (as G01's satellite panels also keep) remains
  reasonable for non-self-service reuse of this same component; only the wiring bug (missing prop at
  the self-service call site) was fixed.
- Seed: `apps/api/src/seed/testEmployeesSeed.ts` — added one submitted-and-approved CL leave
  application for Meera (a seeded employee not otherwise used for a "special" leave scenario, to
  avoid disturbing Rohan's/Priya's existing SUBMITTED-only seed assertions), producing one real
  `LEAVE_APPROVED` G12 timeline entry through the already-built G04 relay — no new SR-posting code
  needed.
- Tests: `apps/api/test/service-register-self-service.test.cjs` (4 tests, real HTTP against
  `seedTestEmployees:true` data) and `apps/web/test/e2e/service-register-self-service.spec.ts`
  (2 Playwright tests — builds its own approved-leave SR event via direct API calls rather than the
  shared seed flag, for the same reason recorded in the G10 payslip coverage report).

## Coverage Matrix — FR-09

| AC | Verdict | Evidence |
|---|---|---|
| AC1 (ordered, paginated, max 100/page) | DONE (pre-existing) | `getTimeline()` sorts by `sequenceNo`; route's `pageItems` helper enforces the 100 cap — untouched this session |
| AC2 (composable filters: category/date/source/confidence/superseded) | NOT_FOUND | No filter parameters are read anywhere in the route or service; `listTimeline`-equivalent returns the full unfiltered set (paginated only). **Deliberately not built**: filtering UI/query params is a real, sizeable feature (multi-dimension filter composition) beyond "access service register / employment history" as a first self-service pass. |
| AC3 (attestation/integrity/confidence/dispute badges) | NOT_FOUND | The frontend renders `eventTypeCode`, date, source module, and hash-chain evidence (entryHash/previousHash) but no attestation/confidence/dispute badge fields — these appear to require the separate `sr_status_events`/confidence-scoring subsystem (`srIntegrityService.ts`), not wired into the timeline view's rendering. Out of this pass's scope. |
| AC4 (superseded entries visually distinct, link to corrigendum) | NOT_FOUND | No corrigendum-linking UI; out of scope for this pass (corrections/disputes named as explicitly out of scope above) |
| AC5 (every view writes `sr_access_log`; non-self access requires `purpose`) | **NOT_FOUND — flagged, not remediated** | `getTimeline()` performs no audit-log write on read at all (P05's `AuditService.recordMutation` is for mutations, not reads, and no `sr_access_log` construct exists in this service). This is a real, BRD-cited gap distinct from the authorization gap this session did fix. Building a dedicated read-access-log subsystem (with a `purpose` capture flow for non-self access) is a meaningfully sized addition; deferred as disproportionate to bundle into the same pass as the authorization fix, but explicitly not silently dropped. |
| Business rule BR-09.1 (self/scoped/auditor visibility) | **REMEDIATED THIS SESSION** | Was completely unenforced; now enforced with tests (own-record allowed, cross-employee 403, hr_admin override allowed, wildcard-permission convention preserved) |
| Edge case: "cross-org HR out-of-scope → 403" | DONE (pre-existing) | Tenant/entity scoping was already enforced via `requireTenantScope`; untouched |
| API: `GET /api/v1/sr/employees/{id}/timeline` | DONE (pre-existing route; this session added the self-scope enforcement) | — |
| API: `GET /api/v1/sr/events/{id}` | **REMEDIATED (post-review)** | Full-review (`docs/reviews/full-review-g12-service-register-self-service.md`) found this was **live-exploitable today**, not just a theoretical gap — independently reproduced cross-employee event access. Fixed: `getEvent()` now takes `ActorContext` and applies the same self-or-override check as `getTimeline()`; the route (`requireSrEvent()`) now passes the real caller's actor instead of a bare scope. The 2 internal admin-tooling callers in `srIntegrityService.ts` (gap-closure validation, certified-extract hash lookup — both already gated by their own outer `authorization.check()` calls, not user-facing reads) use a new `asIntegrityOverrideActor()` synthetic system actor rather than being blocked by a check meant for direct employee reads. Tested: new case in `service-register-self-service.test.cjs` proves own-event access, cross-employee 403, and hr_admin override, all against the real route. |

## Deferred Gaps (flagged, not fixed — with reasoning)

| Gap | Size | Why deferred |
|---|---|---|
| `sr_access_log` write on every timeline view (AC5) | M | Distinct feature (new audit construct + `purpose` capture for non-self access), not bundled with the authorization fix |
| Filter composition (AC2) | M | Multi-dimension query feature, disproportionate for this pass |
| Attestation/integrity/confidence/dispute badges (AC3) | M | Requires wiring the separate confidence-scoring subsystem into the timeline view |
| Superseded/corrigendum linking (AC4) | M | Corrections/disputes explicitly out of this use case's scope |
| Wire response leaks `tenantId`/`entityId` on the SR timeline (found by full-review) | M | Pre-existing, codebase-wide convention — not introduced this session, and not unique to G12 (spot checks suggest most routes echo these back). This session's own `toWirePayslipRecord()` (G10) does strip them while `toWireBankAccount`/`toWireAttendance` (G01/G03) do not, an inconsistency the review correctly flagged — but reconciling it consistently would mean auditing dozens of pre-existing routes across the whole app, well beyond this use case's scope. Deferred as a cross-cutting data-minimization cleanup, not silently ignored. |
| `srIntegrityService.ts`'s `attestChainHead()`/`getStatusChain()` still take a bare `TenantScope`, not `ActorContext` (found by full-review) | S | Pre-existing signature inconsistency in the same admin-only integrity subsystem; not a live vulnerability (these are gated by their own `authorization.check()` calls, same as the two call sites this session did convert via `asIntegrityOverrideActor()`), but worth a consistency pass alongside a future FR-04/07/10/17 integrity-subsystem review. |

## Scorecard

```
LINE-ITEM COVERAGE (FR-09)
============================
Total ACs audited:      5
DONE (pre-existing):     1 (AC1)
REMEDIATED THIS SESSION:  1 (BR-09.1, counted alongside the AC set)
NOT_FOUND (deferred):    4 (AC2, AC3, AC4, AC5)
Related route gap found, not fixed: GET /api/v1/sr/events/{id}
```

## Verdict: GAPS-FOUND

The most severe finding — a complete absence of self-scope enforcement on an employee-facing PII
timeline endpoint — is fixed, tested against real seeded data, and verified safe across the
widest blast radius touched by any fix this session (~25 call sites, zero regressions). The
remaining gaps (filters, badges, corrigendum linking, access logging) are real BRD requirements for
a fully BRD-complete G12 timeline viewer, explicitly listed rather than silently dropped, and judged
disproportionate for a first self-service pass whose core ask was "access service register... —
postings, promotions, service record timeline," which now works correctly and safely.
