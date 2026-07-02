# BRD Coverage Review — G04 Leave-SR Integration

Date: 2026-07-02
BRD under review: `docs/brd/v3/G04-leave-sr-integration.md`
Verdict: **FAIL — relay proof slice implemented, full G04 integration BRD not yet implemented**

## Scope

The G04 BRD defines 18 functional requirements from `FR-01` through `FR-18` (`docs/brd/v3/G04-leave-sr-integration.md:813`, `docs/brd/v3/G04-leave-sr-integration.md:1882`). It covers signed transactional capture, governed mapping, partitioned relay, retry/DLQ, maker-checker triage, state-aware reconciliation, correction/remediation, qualifying-service flags, statutory annotations, historical digitisation, deterministic replay/backfill, monitoring, evidence packs, lease reaping, G12 port conformance, source-ledger integrity, and pre-pension certification.

## Evidence Base

Executable implementation found:

- Single backend service file: `apps/api/src/modules/g04/leaveSrRelayService.ts`.
- Single route file: `apps/api/src/routes/g04.routes.ts`.
- Single G04 web module: `apps/web/src/modules/g04/LeaveSrRelayWorkspace.tsx`.
- Service supports in-memory enqueue for approved leave and cancellation (`apps/api/src/modules/g04/leaveSrRelayService.ts:49`, `apps/api/src/modules/g04/leaveSrRelayService.ts:69`), direct relay to G12 ingest (`apps/api/src/modules/g04/leaveSrRelayService.ts:107`), simulated relay failure into `FAILED` / `DEAD_LETTERED` (`apps/api/src/modules/g04/leaveSrRelayService.ts:95`), dead-letter replay/discard (`apps/api/src/modules/g04/leaveSrRelayService.ts:142`, `apps/api/src/modules/g04/leaveSrRelayService.ts:153`), list and count-only reconciliation (`apps/api/src/modules/g04/leaveSrRelayService.ts:169`, `apps/api/src/modules/g04/leaveSrRelayService.ts:174`).
- G03 calls the G04 relay directly on leave approval and cancellation (`apps/api/src/modules/g03/leaveService.ts:222`, `apps/api/src/modules/g03/leaveService.ts:275`).
- Routes expose only the PH-07 proof surface: outbox list, reconciliation summary, relay, replay, and discard (`apps/api/src/routes/g04.routes.ts:17`, `apps/api/src/routes/g04.routes.ts:30`, `apps/api/src/routes/g04.routes.ts:38`, `apps/api/src/routes/g04.routes.ts:55`, `apps/api/src/routes/g04.routes.ts:65`).
- Tests prove idempotent relay, DLQ replay/discard, route exposure, and status counts (`apps/api/test/ph07-g04-relay.test.cjs:32`, `apps/api/test/ph07-g04-relay.test.cjs:54`, `apps/api/test/ph07-g04-relay.test.cjs:82`).
- UI renders a compact proof card with total/posted/DLQ/discarded counts and evidence bullets (`apps/web/src/modules/g04/LeaveSrRelayWorkspace.tsx:7`, `apps/web/src/modules/g04/LeaveSrRelayWorkspace.tsx:22`, `apps/web/src/modules/g04/LeaveSrRelayWorkspace.tsx:40`).

Specification/design coverage found:

- OpenAPI describes a broad `/api/v1/lsr` G04 management surface and the G12-owned `/api/v1/sr/ingest` write port (`docs/contracts/openapi/G04.yaml:12`, `docs/contracts/openapi/G04.yaml:17`, `docs/contracts/openapi/G04.yaml:85`, `docs/contracts/openapi/G04.yaml:300`).
- OpenAPI separately records the PH-07 implemented minimum route set under `/api/v1/leave-sr/...` (`docs/contracts/openapi/G04.yaml:32`).
- SQL data model defines 14 G04-owned integration entities, including outbox, mapping, posting log, DLQ, reconciliation, corrections, historical batches, config, partition lease, conformance, integrity findings, and pre-pension certificate (`docs/data-model/04-G04-leave-sr-integration.sql:5`, `docs/data-model/04-G04-leave-sr-integration.sql:134`, `docs/data-model/04-G04-leave-sr-integration.sql:625`).
- State machines define the intended G04 lifecycle with `PENDING`, `EXCLUDED`, `BLOCKED_AWAITING_ORIGINAL`, `IN_FLIGHT`, `POSTED`, `FAILED`, `DEAD_LETTERED`, partition lease/reaper, P01 DLQ review, reconciliation remediation, and historical batch adjudication (`docs/contracts/state-machines.yaml:260`, `docs/contracts/state-machines.yaml:269`, `docs/contracts/state-machines.yaml:282`, `docs/contracts/state-machines.yaml:294`, `docs/contracts/state-machines.yaml:307`).

## Coverage Matrix

| Requirement | BRD Evidence | Executable Evidence | Status |
|---|---:|---:|---|
| FR-01 Signed transactional outbox capture | `docs/brd/v3/G04-leave-sr-integration.md:813`; schema `docs/data-model/04-G04-leave-sr-integration.sql:134` | Enqueue exists for approved/cancelled leave (`apps/api/src/modules/g04/leaveSrRelayService.ts:49`, `apps/api/src/modules/g04/leaveSrRelayService.ts:69`), but it is in-memory, not atomic with G03 ledger commit, has no HMAC signature, lineage id, event sequence, `PENDING` state, rollback proof, or immutable DB outbox | **PARTIAL** |
| FR-02 Governed event-mapping catalog | `docs/brd/v3/G04-leave-sr-integration.md:876`; schema `docs/data-model/04-G04-leave-sr-integration.sql:191`; contract `docs/contracts/openapi/G04.yaml:136` | No mapping catalog runtime/routes in `apps/api/src/routes/g04.routes.ts:17`-`75`; relay does not resolve effective-dated mapping or enforce statutory citation | **GAP** |
| FR-03 Partitioned idempotent posting relay | `docs/brd/v3/G04-leave-sr-integration.md:940`; schema `docs/data-model/04-G04-leave-sr-integration.sql:243`; state machine `docs/contracts/state-machines.yaml:273` | Direct relay calls G12 ingest with a stable idempotency key (`apps/api/src/modules/g04/leaveSrRelayService.ts:107`, `apps/api/src/modules/g04/leaveSrRelayService.ts:211`); no partition lease, ordering guard, X.1 job runner, X.3 breaker, posting log, mapping pin, latency metric, or correction-blocking | **PARTIAL** |
| FR-04 Retry/backoff/dead-letter | `docs/brd/v3/G04-leave-sr-integration.md:1008`; schema DLQ/config `docs/data-model/04-G04-leave-sr-integration.sql:288`, `docs/data-model/04-G04-leave-sr-integration.sql:501` | Simulated failures increment attempts and dead-letter after `maxAttempts = 2` (`apps/api/src/modules/g04/leaveSrRelayService.ts:40`, `apps/api/src/modules/g04/leaveSrRelayService.ts:95`); no exponential backoff, permanent/retryable classification, X.3 circuit breaker, pause/resume, rate limit, or posting-log rows | **PARTIAL** |
| FR-05 DLQ triage & maker-checker resolution | `docs/brd/v3/G04-leave-sr-integration.md:1070`; state machine `docs/contracts/state-machines.yaml:282`; contract `docs/contracts/openapi/G04.yaml:426` | Replay/discard methods and routes exist (`apps/api/src/modules/g04/leaveSrRelayService.ts:142`, `apps/api/src/modules/g04/leaveSrRelayService.ts:153`, `apps/api/src/routes/g04.routes.ts:55`, `apps/api/src/routes/g04.routes.ts:65`); no DLQ entity, assignment, annotations, P01 maker-checker, SoD, or blocked replay validation | **PARTIAL** |
| FR-06 State-aware reconciliation engine | `docs/brd/v3/G04-leave-sr-integration.md:1133`; schema `docs/data-model/04-G04-leave-sr-integration.sql:324`, `docs/data-model/04-G04-leave-sr-integration.sql:356`; contract `docs/contracts/openapi/G04.yaml:661` | Runtime reconciliation is a count summary only (`apps/api/src/modules/g04/leaveSrRelayService.ts:174`); no G03/G12 diff, findings, severity, PRE_PENSION run, or reconciliation history | **PARTIAL/GAP** |
| FR-07 Reconciliation remediation | `docs/brd/v3/G04-leave-sr-integration.md:1201`; state machine `docs/contracts/state-machines.yaml:294`; contract `docs/contracts/openapi/G04.yaml:757` | No remediation proposal, P01 approval, apply/waive, correction link, or re-check runtime | **GAP** |
| FR-08 Correction/reversal posting via outbox | `docs/brd/v3/G04-leave-sr-integration.md:1264`; schema `docs/data-model/04-G04-leave-sr-integration.sql:396`; contract `docs/contracts/openapi/G04.yaml:373` | Leave cancellation enqueue exists (`apps/api/src/modules/g04/leaveSrRelayService.ts:69`), but no reversal envelope, supersede chain, original-posted guard, `sr_correction_link`, or correction audit path | **PARTIAL/GAP** |
| FR-09 Qualifying-service/pension impact flags | `docs/brd/v3/G04-leave-sr-integration.md:1329`; contract `docs/contracts/openapi/G04.yaml:891` | No qualifying-impact service, flags, pension warning, or G11-facing calculation | **GAP** |
| FR-10 Statutory annotations | `docs/brd/v3/G04-leave-sr-integration.md:1391`; contract `docs/contracts/openapi/G04.yaml:912` | No annotation generation/runtime for increment, seniority, probation, or rule citations | **GAP** |
| FR-11 Historical leave digitisation | `docs/brd/v3/G04-leave-sr-integration.md:1449`; schema `docs/data-model/04-G04-leave-sr-integration.sql:425`, `docs/data-model/04-G04-leave-sr-integration.sql:457`; contract `docs/contracts/openapi/G04.yaml:946` | No historical batch/record runtime, P06 validation, provisional/adjudication lifecycle, or posting flow | **GAP** |
| FR-12 Replay & backfill tooling | `docs/brd/v3/G04-leave-sr-integration.md:1516`; contract `docs/contracts/openapi/G04.yaml:1134`, `docs/contracts/openapi/G04.yaml:1168` | Dead-letter replay exists (`apps/api/src/modules/g04/leaveSrRelayService.ts:142`); no deterministic backfill from G03 ledger, cohort replay, dry-run, scope limits, or replay manifest | **PARTIAL/GAP** |
| FR-13 Monitoring dashboard & operating model | `docs/brd/v3/G04-leave-sr-integration.md:1578`; contract `docs/contracts/openapi/G04.yaml:1205` | UI card and reconciliation count route exist (`apps/web/src/modules/g04/LeaveSrRelayWorkspace.tsx:22`, `apps/api/src/routes/g04.routes.ts:30`); no operational dashboard, metrics, alert ack, breaker/lease/latency views, or runbook states | **PARTIAL** |
| FR-14 Audit & evidence pack | `docs/brd/v3/G04-leave-sr-integration.md:1639`; contract `docs/contracts/openapi/G04.yaml:1282`, `docs/contracts/openapi/G04.yaml:1319` | Audit mutations are recorded for enqueue/post/discard (`apps/api/src/modules/g04/leaveSrRelayService.ts:121`, `apps/api/src/modules/g04/leaveSrRelayService.ts:161`, `apps/api/src/modules/g04/leaveSrRelayService.ts:215`); no lineage chain builder, export, checksum, citation bundle, or evidence pack | **PARTIAL/GAP** |
| FR-15 Stuck-in-flight lease reaper | `docs/brd/v3/G04-leave-sr-integration.md:1697`; schema `docs/data-model/04-G04-leave-sr-integration.sql:531`; state machine `docs/contracts/state-machines.yaml:276` | No lease expiry fields in runtime event type, no reaper job, no lease renewal/release, no X.2 reaped alert | **GAP** |
| FR-16 G12 write-port bilateral contract & CI conformance | `docs/brd/v3/G04-leave-sr-integration.md:1759`; schema `docs/data-model/04-G04-leave-sr-integration.sql:563`; contract `docs/contracts/openapi/G04.yaml:1356` | G04 uses G12 ingest service with idempotency fields (`apps/api/src/modules/g04/leaveSrRelayService.ts:107`); no signed bilateral contract artifact, conformance runner, live posting gate, retention/index/append-only probes, or CI gate | **PARTIAL/GAP** |
| FR-17 Source-ledger/outbox integrity reconciliation | `docs/brd/v3/G04-leave-sr-integration.md:1820`; schema `docs/data-model/04-G04-leave-sr-integration.sql:593`; contract `docs/contracts/openapi/G04.yaml:1442` | No integrity reconciliation comparing G03 ledger to G04 outbox, no signature verification, no capture findings | **GAP** |
| FR-18 Pre-pension completeness certificate | `docs/brd/v3/G04-leave-sr-integration.md:1882`; schema `docs/data-model/04-G04-leave-sr-integration.sql:625`; contract `docs/contracts/openapi/G04.yaml:1520` | No certificate generation, P01 signing, checksum, G11 consumption, or open-finding gate | **GAP** |

## User-Facing Coverage

The BRD requires an integration operations console covering inbound queue, mapping catalog, posting log, DLQ triage, reconciliation findings, remediation, historical batches, replay/backfill, dashboard metrics, audit evidence, port conformance, capture integrity, and pre-pension certificates (`docs/contracts/openapi/G04.yaml:48`, `docs/contracts/openapi/G04.yaml:78`). Current UI is a static PH-07 proof panel with four counters and two evidence bullets (`apps/web/src/modules/g04/LeaveSrRelayWorkspace.tsx:22`, `apps/web/src/modules/g04/LeaveSrRelayWorkspace.tsx:40`).

## Test Coverage Assessment

Existing tests are useful but narrow:

- Idempotent relay and count reconciliation are tested in `apps/api/test/ph07-g04-relay.test.cjs:32`.
- DLQ replay/discard are tested in `apps/api/test/ph07-g04-relay.test.cjs:54`.
- Route exposure is tested in `apps/api/test/ph07-g04-relay.test.cjs:82`.
- Web tests assert marker strings for route/client/panel presence, not operational behavior (`apps/web/test/ph07-employee-wave.test.cjs:12`, `apps/web/test/ph07-employee-wave.test.cjs:29`).
- No automated tests were found for signed atomic capture, mapping publish, partition leasing, ordering, backoff, classification, P01 DLQ maker-checker, state-aware reconciliation findings, remediation, correction links, qualifying-service flags, annotations, historical digitisation, deterministic backfill, metrics/alerts, evidence export, lease reaper, conformance gate, integrity reconciliation, or pre-pension certificates.

Validation baseline captured during this review:

- `npm test` passed: 125/125 API tests.
- `npm run web:test` passed: 32/32 web tests.
- These green checks validate the implemented proof slices; they do not close the G04 BRD gaps listed here.

## Critical Gaps

| Gap ID | Severity | Gap | Evidence |
|---|---|---|---|
| G04-COV-001 | Critical | G04 runtime is an in-memory relay proof slice, not the signed, transactional, DB-backed integration substrate required by the BRD. | Runtime service `apps/api/src/modules/g04/leaveSrRelayService.ts:38`-`234`; BRD FR-01 `docs/brd/v3/G04-leave-sr-integration.md:813`; schema outbox `docs/data-model/04-G04-leave-sr-integration.sql:134` |
| G04-COV-002 | Critical | Full `/api/v1/lsr` contract surface is not implemented; only five `/api/v1/leave-sr` proof routes exist. | OpenAPI full surface `docs/contracts/openapi/G04.yaml:85`-`1596`; implemented marker `docs/contracts/openapi/G04.yaml:32`; route file `apps/api/src/routes/g04.routes.ts:17`-`75` |
| G04-COV-003 | Critical | Reliability controls needed for government SR correctness are absent: partition leases, ordering guard, reaper, posting log, state-aware reconciliation, source-ledger integrity, and conformance gate. | BRD FR-03/06/15/16/17 `docs/brd/v3/G04-leave-sr-integration.md:940`, `docs/brd/v3/G04-leave-sr-integration.md:1133`, `docs/brd/v3/G04-leave-sr-integration.md:1697`, `docs/brd/v3/G04-leave-sr-integration.md:1759`, `docs/brd/v3/G04-leave-sr-integration.md:1820` |
| G04-COV-004 | High | Statutory business capabilities are absent: mapping catalog, qualifying-service rules, annotations, historical digitisation, evidence pack, and pre-pension certificate. | BRD FR-02/09/10/11/14/18 `docs/brd/v3/G04-leave-sr-integration.md:876`, `docs/brd/v3/G04-leave-sr-integration.md:1329`, `docs/brd/v3/G04-leave-sr-integration.md:1391`, `docs/brd/v3/G04-leave-sr-integration.md:1449`, `docs/brd/v3/G04-leave-sr-integration.md:1639`, `docs/brd/v3/G04-leave-sr-integration.md:1882` |
| G04-COV-005 | High | UI is not a usable IntegOps/SR Custodian workspace. | Full OpenAPI tags `docs/contracts/openapi/G04.yaml:48`-`78`; current UI `apps/web/src/modules/g04/LeaveSrRelayWorkspace.tsx:7`-`46` |

## Scorecard

| Category | Score | Notes |
|---|---:|---|
| BRD line-item implementation | 8 / 18 FRs touched, 0 / 18 complete | FR-01, 03, 04, 05, 06, 08, 12, 13, 14, 16 are partial or proof-only; remaining statutory/reliability controls are gaps |
| API contract conformance | Low | Implemented route set is much smaller and uses proof namespace `/leave-sr`, while full contract is `/lsr` |
| Data model coverage | High as design artefact | SQL models the full bridge, but runtime uses in-memory arrays |
| Backend behavior | Medium for relay proof slice | Direct G03 to G04 to G12 path works for simple approved/cancelled leave |
| Frontend behavior | Low | Static proof card only |
| Automated tests | Medium for proof slice, low for full BRD | Tests cover relay/DLQ/routes only |

Overall status: **Not release-complete for G04.** The current implementation is a good proof that the G03 leave decision can reach G12 through a G04-owned relay, but it does not implement the reliability, statutory, operational, and evidence controls that make G04 a production-grade leave-to-SR bridge.

## Recommended Remediation Path

1. Keep the existing G03-to-G04-to-G12 relay tests as regression baseline.
2. Implement the DB-backed signed outbox and posting log first: FR-01, FR-03, FR-04, FR-15.
3. Add mapping catalog and statutory rule pinning before expanding leave types: FR-02, FR-09, FR-10.
4. Add state-aware reconciliation, remediation, and source-ledger integrity before production data migration: FR-06, FR-07, FR-17.
5. Add correction/reversal chains and deterministic backfill: FR-08, FR-12.
6. Add operational console, evidence pack, conformance gate, historical digitisation, and pre-pension certificate after the reliability spine is in place: FR-11, FR-13, FR-14, FR-16, FR-18.
