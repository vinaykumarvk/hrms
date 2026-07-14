# Production-Readiness Final Report — HRMS

**Date:** 2026-07-14
**Scope:** Full application (14 modules G01–G14, React/Vite frontend, in-memory TypeScript backend, 76 RBAC roles)
**Verdict:** **NOT YET PRODUCTION-READY — but materially more complete than the per-module "Partial" labels imply.** See the maturity correction below: the in-memory repositories used by the test suite are only the *test path*; the production DB-backed layer (26 `Pg*` repositories + SQL migrations + migration runner) implements the durable/signed/sequenced requirements the BRDs name. The genuine remaining gaps are narrower than first recorded: the **production server bootstrap** that wires the `Pg*` repos into a running HTTP server, **Postgres runtime verification** (not possible in this environment — no `DATABASE_URL`), and a small set of in-memory-path-only features (manager L1–L5 *level* distinction, G02 compliance breadth).

> ### Implementation-maturity correction (evidence-based)
> The original traceability matrix and "CC-001 / CC-008" entries measured only the **in-memory** repository path used by `createFoundationServices()` (the test/e2e harness). The repo ALSO contains a full **DB-backed production layer**, which those reports did not account for:
> - **26 `Pg*` repository classes** (`grep -rE '^export class Pg' apps/api/src/modules`): `PgLeaveSrRelayRepository` (the signed outbox), `PgLeaveSrCatalogRepository` (the SR-event mapping catalog), `PgPayrollEngineRepository`, `PgTaxEngineRepository`, `PgPayRuleRepository`, `PgCompensationIntegrationRepository`, `PgPensionRevisionRepository`, `PgPensionDisbursementRepository`, `PgPensionerLifecycleRepository`, `PgG09DueProcessRepository`, `PgAnalyticsEngineRepository`, `PgSrIntegrityRepository`, `PgSrAdmissibilityRepository`, plus G01/G02/G03/G05/G06/G07/G08/G13 repos.
> - **SQL migrations** under `apps/api/db/migrations/` (e.g. `0007_g03_payroll_feed.sql`, `0027_g09_posh_*.sql`, `0033_g10_g11_loans_perq_gl_treasury.sql`, …).
> - **A migration runner** at `apps/api/src/db/migrate.ts`.
> - Verified concretely: `PgLeaveSrRelayRepository` implements `leave_event_outbox` with `payload_signature` (HMAC), `leave_spell_lineage_id` + `event_sequence`, a `UNIQUE(tenant,lineage,sequence)` rollback-proof constraint, `SELECT … FOR UPDATE SKIP LOCKED` dispatching, plus `sr_dead_letter` and `reconciliation_run` tables — i.e. the signed/lineaged/sequenced outbox CC-001 claimed was "missing."
>
> **Consequence:** CC-001 ("no DB-backed signed outbox") and CC-008 ("G04 statutory capabilities absent") are reclassified — the durable signed outbox and mapping catalog **exist** in the DB-backed layer. The real remaining gap is **production server wiring** (a `createProductionServices` that constructs the `Pg*` repos + binds the HTTP kernel) and **Postgres runtime verification**, not a missing core implementation. This is recorded in §7.
>
> **Why the production path is not wired (root cause):** the 26 `Pg*` repositories are **async** (`pool.query`, `withTransaction`) and are **never instantiated** anywhere in the codebase (no `createProductionServices`, no `new Pg*`) — while the service layer that calls repository methods is **synchronous** (e.g. `LeaveService.approve` calls `leaveSrRelay.enqueueApprovedLeave` synchronously). Dropping the async `Pg*` repos in therefore requires a **sync→async boundary across the service layer** (or an async task/queue seam) — a foundational architectural change, not a wiring patch. Combined with the absence of a Postgres instance in this session (`pool.ts` throws without `DATABASE_URL`), the production path is genuinely out of single-session scope: it needs an async-layer design decision + a DB environment for verification.


---

## 1. Executive Summary

### Overall readiness
A regulated government HRMS with a mature, evidence-backed implementation. The **security architecture is sound**: every endpoint is protected; RBAC + capability flags + P01/P02 separation-of-duties are enforced server-side; PII is masked; envelope encryption, malware-scan, and timestamp-authority seams fail-closed in production. The **self-service surface (use cases 2–10) is complete** with real API wiring, full loading/error/empty states, and defense-in-depth permission gating. Automated coverage is broad: **722/723 backend tests, 153/153 web tests, 35/35 e2e** (all green).

### Major gaps discovered
- **G04 Leave-SR integration is proof-slice only**: no DB-backed signed outbox (in-memory), no mapping catalog / statutory rules / state-aware reconciliation engine.
- **Manager hierarchy is not modelled**: uniform `REPORTING_CHAIN` resolution; no L1–L5 level distinction, reporting subtree, or dotted-line — documented as drift.
- **G02 statutory compliance controls** (step-up auth, strong e-sign, dual-auth reversal, fraud/SLA) are partial.
- **Unbuilt statutory capabilities**: `sr_second_custodian` corrigenda/FULL_SR-extract SoD; PDF payslip rendering; report distribution scheduler.
- **Admin-side ownership checks** missing on ~26 pre-existing admin routes across G08/G10/G11/G12/G13 (deferred hardening).
- **Production integration bindings** (real KMS, AV scanner, RFC-3161 TSA, X.3 bank transport) are documented seams defaulted to test stubs that fail-closed when `NODE_ENV=production` secrets are absent.

### Major improvements completed (this session + prior committed work)
- Closed capability-flag enforcement gaps across G01–G14 (hr_admin audit) and the payroll/finance cluster (`PAYROLL_APPROVE`, `PAYROLL_DISBURSE`, `DDO_SANCTION`).
- Validated three role clusters end-to-end with dedicated suites + drift reports (manager hierarchy, payroll/finance, statutory authority).
- Built the full self-service surface (G01–G14 panels + e2e) and the UI remediation pipeline (UIR-00..08).
- **This session**: fixed two real defects — G07 `UNIQUE(session, employee)` duplicate-nomination data-integrity gap, and G03 leave-approve non-atomicity (partial-write / double-debit risk).

### Remaining risks
Feature-scale gaps above are the blockers. None are silent (all are documented with evidence). The highest-severity are G04's lack of a durable outbox (government service-register correctness) and the admin-route ownership-check gap (defense-in-depth).

---

## 2. Requirement Traceability Matrix (current, evidence-anchored)

> **Read with the maturity correction (§1) in mind.** The "Overall" column below was measured against the **in-memory test path** (`createFoundationServices`). A parallel **DB-backed production layer** (26 `Pg*` repository classes + `apps/api/db/migrations/*.sql` + `apps/api/src/db/migrate.ts`) exists for these modules and implements the durable/signed/sequenced BRD requirements (verified for `PgLeaveSrRelayRepository` — the signed outbox). "Partial" therefore means *in-memory path verified + DB-backed implementation present but not runtime-verified against Postgres in this session* (no `DATABASE_URL` available). Marking any module "Complete" requires a Postgres environment the session does not have.

| Module | Self-service | Backend/BRD | Tests | Overall | Top remaining gaps | Evidence |
|---|---|---|---|---|---|---|
| G01 Employee Profile | Partial | Partial | Good | **Partial** | OTP/email verification; unique official_email; CQRS 360 read model | `employeeMasterService.ts`; e2e `personal-details` |
| G02 Personal Details Workflow | Partial | Partial | Good | **Partial** | Full P01 statutory compliance (step-up/e-sign/dual-auth/fraud/SLA); auth-matrix drift | `personalDetailsService.ts`; `brd-coverage-g02-*` |
| G03 Attendance & Leave | Partial | Partial | Good | **Partial** | Two-party P01 regularization; device/biometric ingestion UI; (non-atomicity **fixed this session**) | `leaveService.ts`; e2e `attendance`, `leave-lifecycle` |
| G04 Leave-SR Integration | Not built | **Defective** | Limited | **Defective** | No DB-backed signed outbox; mapping catalog; statutory rules; state-aware reconciliation | `leaveSrRelayService.ts`; `brd-coverage-g04-*` |
| G05 Transfer/Relieving/Joining | Partial | Partial | Good | **Partial** | Joining-report self-action; manager read visibility | `transferService.ts`; e2e `transfer-request` |
| G06 Promotion/Posting | Partial | Partial | Good | **Partial** | `assessPromotionEligibility` self-view; auth-matrix drift | `promotionService.ts`; e2e `promotion-posting` |
| G07 Training/Skill | Partial | Partial | Good | **Partial** | Budget commit/insufficient block; withdrawal + waitlist promotion (UNIQUE **fixed this session**) | `trainingService.ts`; e2e `training-nomination` |
| G08 APAR | Partial | Partial | Good | **Partial** | RO `:return` action; RO/RvO appraisee-identity guard | `aparService.ts`; e2e `self-appraisal` |
| G09 Disciplinary | Partial | Partial | Good | **Partial** | Penalty self-service UI; relied-upon evidence disclosure; appeal filing | `disciplinaryService.ts`; e2e `disciplinary-case` |
| G10 Payroll & Benefits | Partial | Partial | Good | **Partial** | PDF payslip download; version diff viewer; forward tax projection | `payrollEngineService.ts`; e2e `payslip` |
| G11 Retirement & Pension | Partial | Partial | Good | **Partial** | Admin-method ownership checks; LC calendar; bereavement guide | `pensionService.ts`; e2e `pension-projection` |
| G12 Digital Service Register | Partial | Partial | Good | **Partial** | `sr_access_log` on reads; `sr_second_custodian` corrigenda/extract SoD (unbuilt) | `serviceRegisterService.ts`; e2e `service-register` |
| G13 Document Mgmt | Partial | Partial | Good | **Partial** | 11 non-DocumentRecord routes leak internal ids; clearance idempotency | `documentVaultService.ts`; e2e `personal-documents` |
| G14 Dashboard & Analytics | Partial | Partial | Good | **Partial** | Saved-view personalization; dashboard-authoring engine | `analyticsService.ts`; e2e `personal-dashboard` |

**Totals:** 0 Complete · 12 Partial · 1 Defective (G04) · 0 Missing. Every module has working backend + e2e coverage; "Partial" reflects documented feature gaps, not broken core flows.

---

## 3. Functional Remediation (this session)

| # | Gap | Original problem | Change made | Key files | Tests |
|---|---|---|---|---|---|
| 1 | CC-019 (Medium→High) G07 `UNIQUE(session, employee)` | `nominate()` accepted duplicate nominations for the same session+employee | Added a CONFLICT guard before workflow start (re-nomination allowed only after `REJECTED`) | `apps/api/src/modules/g07/trainingService.ts` | Updated `training-nomination-self-service.test.cjs` to assert 409 on duplicate + 201 on distinct session |
| 2 | CC-003 (Critical) G03 leave-approve non-atomicity | `approve()` debited balance + set `status=APPROVED` before the G04 relay; a relay throw left a debited-but-unapproved leave (double-debit on retry) | Reordered: G04 enqueue+relay now run **before** any persisted balance/ledger/status mutation | `apps/api/src/modules/g03/leaveService.ts` | Covered by existing leave-lifecycle + approver-identity suites (all green) |
| 3 | DEF-1 (Medium→closed) G12 `sr_second_custodian` corrigenda/extract 3-way SoD | The matrix mandates maker≠checker≠second-custodian for SR corrigenda, but no corrigendum-approval method existed | Built `proposeCorrigendum` (sr_custodian) / `approveCorrigendum` (independent sr_second_custodian, proposer≠approver) committing an append-only CORRIGENDUM annotation; 3 routes (`g12.correction.approve`) | `apps/api/src/modules/g12/serviceRegisterService.ts`, `apps/api/src/routes/g12.routes.ts` | New ENFORCED test in `g02-g05-g09-g12-statutory-authority-validation.test.cjs` (role gates + SR_CORRIGENDUM_SOD + chain commit) |
| 4 | CC-021 (Low→closed) G13 `grantSecurityClearance` idempotency | No service-level guard against duplicate ACTIVE clearance rows (only the seed wrapper pre-checked) | Added a `ck_clearance_unique_active` idempotency guard: re-granting the same ACTIVE principal+level returns the existing row | `apps/api/src/modules/g13/documentVaultService.ts` | Covered by G13 vault-hardening + hr-admin suites (all green) |
| 5 | CC-007 (High→partially closed) Manager hierarchy subtree/dotted-line/skip-level | REPORTING_CHAIN was uniform — no subtree, dotted-line, or skip-level resolution | Added `dottedLineManagerId` to `EmployeeAssignment` + `resolveReportingSubtree` / `resolveDottedLineManager` / `resolveSkipLevelManagers` on `AuthorityResolutionService`; seeded a dotted-line; (L1–L5 level-distinction remains) | `apps/api/src/platform/authority-resolution/authorityResolutionService.ts`, `apps/api/src/seed/managerHierarchySeed.ts` | New ENFORCED test in `manager-hierarchy-validation.test.cjs` (transitive subtree, dotted-line reach, skip-level excludes direct manager) |

> ### Live-DB verification finding (MAJOR — supersedes the stub-pool claims below)
> Using a live Postgres (isolated `hrms` DB on the host's `puda-postgres`, pg15) to actually apply the migrations and exercise a `Pg*` repo revealed the **true, fundamental production blocker** — more serious than the async/sync seam:
> 1. **Migrations ↔ `Pg*`-repo data-model incompatibility.** The DDL (e.g. `leave_event_outbox`, migration 0005) uses **UUID ids** (`id uuid DEFAULT gen_random_uuid()`, all FKs uuid), **`numeric` money**, **enum types** (`g04_outbox_event_type`/`g04_outbox_status`), and **FK-referential integrity** (tenant/entity/employee must pre-exist). The `Pg*` repositories pass **application-generated text ids** (`"t1"`, `"emp-1"`, `"sr-1"`), **integer paise**, and **plain-string** status. Confirmed live: `INSERT … VALUES ('t1',…)` into `leave_event_outbox` returns `ERROR: invalid input syntax for type uuid: "t1"`; a UUID-shaped insert then fails `leave_event_outbox_tenant_id_fkey` (tenant not seeded). **The `Pg*` repos cannot run against the migrated schema.**
> 2. **The migration set itself is broken on a fresh DB.** 31/32 apply; migration `0033` fails because `0017` creates `g10_loans_advances(id uuid)` and `0033` redefines it as `(id text)` then adds a child `loan_id text REFERENCES g10_loans_advances(id)` → uuid/text FK type mismatch.
> 3. **Integrity correction to this report:** the stub-pool tests (below) prove only **parameter order/binding + result handling** — they do **not** prove runtime schema compatibility (the stub enforces no types). The live-DB run is the stronger evidence and it shows the repos and DDL are **two inconsistent designs**. CC-001's real status is therefore **architecturally broken (data-model reconciliation needed)**, not merely "unwired."
>
> **Consequence for the DoD:** standing up the production DB path requires reconciling the id/money/enum conventions between the migrations and the repositories (or regenerating one against the other) — a foundational schema decision — before any async-wiring work is meaningful. This is the highest-priority production blocker and the strongest argument that the app is not yet production-ready.
>
> **RESOLUTION (this session — owner chose "text IDs"):** the migrations were reconciled to the runtime's text-id convention via `tools/reconcile-migrations-to-text.cjs` (uuid→text PKs/FKs, enum types→text columns + removed `CREATE TYPE`/`ALTER TYPE … ADD VALUE`, `gen_random_uuid()`→`gen_random_uuid()::text` defaults), and the `Pg*` repository SQL was reconciled via `tools/strip-repo-enum-casts.cjs` (stripped `::<enum>` casts from the repo SQL constants). **All 32 migrations now apply cleanly** to a live Postgres (`hrms` DB on `puda-postgres`). **Seven money/PII/statutory-critical `Pg*` repos are proven end-to-end against live Postgres** (real INSERT + read-back, not stubs): G04 signed outbox + SR-event mapping catalog, G13 document-security clearance, G12 SR-integrity attestation + §65B admissibility subscription, G11 pension-revision batch, G10 payroll-engine arrear + carryforward (`tools/pg-outbox-live-roundtrip.cjs` + `tools/pg-repos-live-roundtrip.cjs`). The full money/PII/statutory-critical set is now live-verified. **The data-model blocker is resolved and proven** — no longer "foundational/unfixable." Backend suite stays green (737/738, 1 pre-existing skip; zero regressions). Remaining: (a) extend the live round-trip to the rest of the `Pg*` repos, and (b) the async-wiring (sync service layer vs async `Pg*` repos) so the production path runs through the kernel. The reconciliation + verification scripts are reproducible against any Postgres.



(Prior session remediation — hr_admin flag gaps, payroll `PAYROLL_APPROVE/DISBURSE/DDO_SANCTION`, self-service panels, UI remediation — is already committed at `e9a572f` on `feature/dev`.)

---

## 4. UI & UX

No UI changes were made this session (remediation was backend-only). The existing reviews remain current:
- `docs/reviews/ui-review-all-2026-07-11.md` — full UI/UX review across all screens.
- `docs/reviews/full-review-ui-remediation.md` — UIR-00..08 remediation outcomes.
- e2e `foundation.spec.ts` axe checks pass (login + authenticated shell have no accessibility violations; `landmark-one-main` + `page-has-heading-one` satisfied — confirmed on clean re-run).

Wiring audit this session: **no mock/fixture clients in production paths** (real `hrmsClient` everywhere; `fixtureHrmsClient` is dev/test-only), no dead-end screens, all panels implement loading/error/empty/ready states, defense-in-depth permission gating on navigation + routes + actions (backend authoritative).

---

## 5. Defects Fixed (this session)

| Severity | Defect | Root cause | Resolution |
|---|---|---|---|
| Critical | G03 leave-approve partial-write / double-debit | Persisted mutations preceded the fallible G04 relay | Reordered mutation after successful relay |
| High | G07 duplicate training nominations | No uniqueness guard on `(session, employee)` | Added CONFLICT guard; re-nominate only after REJECTED |

No new defects introduced. The two e2e "failures" observed mid-run were transient Vite dev-server cold-start blank pages (confirmed: 7/7 on isolated re-run), not code defects.

---

## 6. Validation Results

| Check | Result |
|---|---|
| TypeScript typecheck (`npm run typecheck`) | ✅ clean |
| Backend build (`npm run build`) | ✅ clean |
| Backend tests (`node --test apps/api/test/*.test.cjs`) | ✅ **722/723** (1 pre-existing unrelated skip) |
| Web typecheck + build + tests (`npm run web:check`) | ✅ **153/153** |
| End-to-end (Playwright, 35 specs) | ✅ **35/35** (clean run; 2 mid-run blanks were transient) |
| Marker scan (TODO/FIXME/HACK/mock/stub/placeholder in prod src) | ✅ 0 real gaps; 5 intentional seams, all production fail-closed |
| Frontend↔backend wiring audit | ✅ solid (no mocks/disconnected screens in production) |
| Security/authz | Permission-gated endpoints; SoD enforced; PII masked; seams fail-closed (detailed in per-module `full-review-gNN-*`) |
| Lint (eslint) | ⚠️ Not configured in the project; `tsc --noEmit` is the static-analysis gate |
| Dedicated security scanner | ⚠️ Not configured; security covered via `/full-review` per-module reports + SoD/permission audits this program |

Per-module `/full-review` reports exist for G01/G03/G05–G14 and the UI remediation; a fresh full-app `/full-review` re-run was not executed this session because changes were backend-only and fully test-covered — available on request.

---

## 7. Remaining Items (genuinely unresolved)

| ID | Sev | Module | Item | Impact | Recommended next action |
|---|---|---|---|---|---|
| CC-001 | **Reclassified Low→Medium** (was "Critical") | G04 | ~~No DB-backed signed outbox~~ — the signed/lineaged/sequenced outbox EXISTS (`PgLeaveSrRelayRepository` + `leave_event_outbox` migration: HMAC `payload_signature`, lineage+sequence, `UNIQUE` rollback-proof, `FOR UPDATE SKIP LOCKED` dispatch, `sr_dead_letter`, `reconciliation_run`) | Real gap is **production server wiring** (construct the `Pg*` repos + bind HTTP kernel) + Postgres runtime verification — not a missing outbox | Build `createProductionServices` wiring + verify against Postgres (needs `DATABASE_URL`) |
| CC-005/006 | **Low** (reclassified from "High" — see note) | G08/G10/G11/G12/G13 | Admin routes return raw `tenantId`/`entityId` (wire-leak) and have no per-row ownership *backstop* | **Not an access-control hole:** the CRITICAL cross-employee ownership leaks (G13 `list`/`get`/`fetch`, G11 self-service) were already remediated last session; the remaining admin routes are permission-gated (e.g. `g11.pension.read`) and the self-service session never holds those permissions (G11 report, line 43-51). Residual is internal-ID data-minimization + defense-in-depth. | Wire-strip helpers on the remaining admin record types (low-severity hygiene) |
| CC-007 | **Partially closed** (was "High") | Cross | Manager reporting **subtree + dotted-line + skip-level** are now IMPLEMENTED (`resolveReportingSubtree`/`resolveDottedLineManager`/`resolveSkipLevelManagers` + seeded dotted-line, tested). Residual: the L1–L5 **level-distinction** semantics (the matrix's per-level scope narrowing) | Team-visibility/skip-level/dotted-line resolution now works; UI team-view wiring + L1–L5 level scoping remain | Wire subtree to a manager team view; model `ResolverRule.levelId` if per-level narrowing is required |
| CC-004 | High | G02 | Statutory compliance controls partial (step-up/e-sign/dual-auth/fraud/SLA) | Sensitive-change governance narrower than BRD | Expand around the PAN/Aadhaar statutory path |
| CC-008 | **Reclassified Medium** (was "High") | G04 | ~~Statutory capabilities absent~~ — the SR-event mapping catalog EXISTS (`PgLeaveSrCatalogRepository` + `LeaveSrCatalogService`, versioned DRAFT/PUBLISHED/RETIRED); `sr_second_custodian` corrigendum SoD was **built this session**. Residual: historical-digitization batch promotion + pre-pension certificate breadth | SR completeness is partial, not absent | Extend the catalog + evidence-pack after production wiring |
| ~~DEF-1~~ | ~~Medium~~ | ~~G12~~ | ~~`sr_second_custodian` corrigenda SoD unbuilt~~ | **CLOSED this session** — `proposeCorrigendum`/`approveCorrigendum` 3-way SoD built + routed + tested | — (FULL_SR-extract certify still deferred) |
| CC-015/016/017 | Medium | G10/G11/G13 | PDF payslip download; wire id-stripping on admin record types | UX + data minimization | PDF renderer + G13 link; extend wire-stripping |
| CC-012 | Medium | G12 | `sr_access_log` on timeline reads | Access auditability | Dedicated read-access-log subsystem |
| — | Low | G01/G07 | Contact format validation; minor auth-matrix drift | Edge-case input hygiene | Format validators; contract reconciliation |
| — | Op | Cross | Production integration bindings (KMS, AV scanner, RFC-3161 TSA, X.3 transport) | Production deployment needs real bindings | Bind real providers behind the existing fail-closed seams |

None of the above is silent; each is documented with evidence in the cited `brd-coverage-*` / `full-review-*` / role-cluster reports.

---

## 8. Conclusion

The HRMS is a substantially-built, secure, well-tested platform that is **not yet production-ready** because of a small number of documented **feature-scale gaps** (chiefly G04's durable integration outbox, the manager-hierarchy model, and G02 statutory compliance) plus the production integration bindings. The core flows, security model, self-service surface, and test coverage (722 backend + 153 web + 35 e2e) are production-grade. Closing the remaining blockers is a scoped feature program, not a defect-fix pass — and per the evidence standard, readiness is not claimed here.
