# Full Review: G10 Payslip Self-Service

## Verdict
PASS (post-remediation)

**Update 2026-07-13 (post-review verification):** F1 (wire leak), F2 (type-accuracy), and F3
(aria-expanded) were fixed and independently re-verified: a live `api.dispatch()` probe against a
real seeded PUBLISHED payslip now returns only the declared fields (`id`, `payslipNo`,
`employeeId`, `period`, `version`, `status`, `grossCents`, `deductionsCents`, `netPayCents` on the
header; `componentCode`, `lineType`, `amountCents`, `sequenceNo` on each line — no `tenantId`,
`entityId`, `runId`, `payslipId`, or `calcTrace`); `PayslipHeaderView`/`PayslipLineView`
(`apps/web/src/api/hrmsClient.ts:317-335`) match that shape exactly, including `"LWP_RECOVERY"` in
the `lineType` union; `MyPayslipsPanel.tsx:94` carries `aria-expanded`. Full backend suite (657/658,
1 pre-existing skip), web unit suite (153/153), and the e2e spec all re-confirmed green. F4
(optional `employeeId` prop / first-employee fallback in `MyPayslipsPanel`) remains an accepted,
documented low-risk deferral — the server-side `assertSelfOrOverride` check is the real security
boundary regardless of what the UI defaults to.

Original review text below, retained for evidence trail.

---

The self-or-override P02 scope guard is correctly and symmetrically applied to both new reads
(payslips and YTD), is covered by passing tests, and the pre-existing call sites to
`getYtdStatement` all pass override actors so the signature change does not break anything.
However, the new routes leak internal engine fields (`tenantId`, `entityId`, `runId`, `payslipId`,
and a full per-line `calcTrace` computation trace) to a plain self-service employee — the same
class of problem the task asked to check for, just manifesting as an unfiltered wire response
rather than a `submittedByUserId`-style single field — and the expand/collapse button in
`MyPayslipsPanel` has no `aria-expanded` state. Both are fixable without touching contracts/tests
and do not require rearchitecting the feature, hence CONDITIONAL rather than FAIL.

## Scope
- **Target**: G10 "view payslips and payroll history" self-service slice (API + web + seed + tests)
  built this session.
- **Selected path**: light/standard review (brownfield addition on stable contracts; no new BRD
  artefact authored this session beyond the referenced coverage doc).
- **Files reviewed**:
  - `apps/api/src/modules/g10/payrollEngineService.ts` (`listMyPayslips`, `getYtdStatement`,
    `assertSelfOrOverride`, `PAYROLL_SELF_SERVICE_OVERRIDE_ROLES`)
  - `apps/api/src/routes/g10.routes.ts` (new `GET .../payslips`, `GET .../ytd`,
    `POST .../enrolments` routes)
  - `apps/api/src/modules/g10/payrollEngineRepository.ts` (`EnginePayslip`, `EnginePayslipLine`
    field definitions)
  - `apps/api/src/modules/g01/bankAccountService.ts` + `apps/api/src/routes/g01.routes.ts`
    (`toWireBankAccount` reference pattern)
  - `apps/api/src/modules/g03/leaveService.ts` + `apps/api/src/routes/g03.routes.ts`
    (`toWireAttendance` reference pattern)
  - `apps/web/src/api/hrmsClient.ts`, `apps/web/src/api/fixtureHrmsClient.ts`
    (`PayslipLineView`/`PayslipHeaderView`/`PayslipRecordView`/`YtdStatementView`,
    `listMyPayslips`/`getMyYtdStatement`)
  - `apps/web/src/modules/g10/MyPayslipsPanel.tsx` (new)
  - `apps/web/src/modules/g01/EmployeeBankAccountsPanel.tsx` (reference state-machine pattern)
  - `apps/web/src/App.tsx` (`renderRoute` signature change, `/me/payslips` wiring)
  - `apps/web/src/app/session.ts`, `apps/web/src/app/navigation.ts`
  - `apps/web/src/styles.css` (`.inbox-item` rules)
  - `apps/api/src/seed/testEmployeesSeed.ts` (`seedTestPayrollLifecycle`)
  - `apps/api/src/platform/foundationServices.ts` (seed wiring)
  - `apps/api/test/payslip-self-service.test.cjs` (new, 5 tests)
  - `apps/api/test/ph09b-payroll-engine.test.cjs`, `apps/api/test/ph15a-g10-tax-tds.test.cjs`,
    `apps/api/test/ph09d-compensation-integration.test.cjs` (existing `getYtdStatement` callers,
    checked for signature-change breakage)
  - `apps/web/test/e2e/payslip-self-service.spec.ts` (new, 2 Playwright tests)
- **Artefacts used**: `docs/reviews/brd-coverage-g10-payslip-self-service-2026-07-13.md` (for the
  already-flagged, not-to-repeat items); live `tsc` typecheck; live `node --test` run; live
  `api.dispatch()` wire-shape probe against the seeded in-memory backend.

## Checks run

| Check | Ran? | Result | Evidence |
|---|---|---|---|
| Wire-shape leak check for `EnginePayslip`/`EnginePayslipLine` (live dispatch, not static read) | Yes | FAIL — leaks `tenantId`/`entityId`/`runId`/`payslipId`/`calcTrace` | Live `api.dispatch()` probe against seeded Arjun payslip; see Finding F1 |
| Self-or-override scope applied to both new routes | Yes | PASS | `payrollEngineService.ts:640-661` (`listMyPayslips`, `assertSelfOrOverride`); `payrollEngineService.ts:583-584` (`getYtdStatement`) |
| Override-role spoofability via dev bridge (brief note only) | Yes | Same pre-existing caveat as G01/G03, not new | `tools/local-api-server.mjs` decodes bearer claims without signature verification (documented caveat in `bankAccountService.ts:206-212`); applies identically here since `assertSelfOrOverride` trusts `actor.roles`/`permissions` |
| `getYtdStatement` signature-change breakage across callers | Yes | PASS — no breakage | `grep` of `apps/api/src` + `apps/api/test` for `getYtdStatement`/`payrollEngine.`; all 4 call sites (`ph09b-payroll-engine.test.cjs`, `ph15a-g10-tax-tds.test.cjs`) use a `maker()`/`approver()` actor with `permissions: ["*"]`, which satisfies the override branch |
| TypeScript build/typecheck | Yes | PASS | `npm run typecheck` (apps/api tsconfig) — clean, no errors |
| API test suite (new + adjacent G10 suites) | Yes | PASS — 25/25 | `node --test apps/api/test/payslip-self-service.test.cjs apps/api/test/ph09b-payroll-engine.test.cjs apps/api/test/ph15a-g10-tax-tds.test.cjs apps/api/test/ph09d-compensation-integration.test.cjs` → `# pass 25 / # fail 0` |
| Client type accuracy (`PayslipHeaderView`/`PayslipLineView`) vs. real wire shape | Yes | FAIL — declared types omit fields the server actually returns | `hrmsClient.ts:296-313` declares a narrow shape; live response includes 5+ undeclared fields per record (see F1); `request<T>()` (`hrmsClient.ts:1227`) is an unchecked cast, so this mismatch is silent at runtime |
| MyPayslipsPanel expand/collapse accessibility | Yes | FAIL — no `aria-expanded` | `MyPayslipsPanel.tsx:104-109` |
| Anti-skeleton check (real API calls, real data, real states) | Yes | PASS | See Component substance table below |
| CSS regression check (`.inbox-item`) | Yes | PASS — safe, single consumer | `Inbox.tsx:25-40` is the only consumer; `min-width:0`/`overflow-wrap:anywhere` only engage on overflow, `gap:8px` is additive |
| Seed idempotency (`seedTestPayrollLifecycle`) | Yes | PASS | `testEmployeesSeed.ts:530-568`: guarded by `listMyPayslips(...).some(period match)` early return, `listComponents(actor).length === 0` guard for components/rules/rates, and `enrolEmployee` upserts by existing enrolment id — no throw or duplication on re-invocation |
| `employeeId` fallback ("first employee in tenant") still present in `MyPayslipsPanel` itself | Yes | Latent defect, not reachable via the wired route | `MyPayslipsPanel.tsx:16-22` (`resolveEmployeeId`); `App.tsx:182` always passes `sessionEmployeeId`, so the fallback is dead code on the only wired call site today, but the component still contains the same pattern the task said was proven wrong for self-scoped reads |
| BRD coverage cross-check | Yes | Reviewed, consistent | `docs/reviews/brd-coverage-g10-payslip-self-service-2026-07-13.md` already lists the no-PDF / no-version-viewer / permission-string-naming items as known; not repeated here |

## Findings

| ID | Severity | Domain | File:line | Claim | Evidence | Recommended action | Repair mode eligible? |
|---|---|---|---|---|---|---|---|
| F1 | HIGH/P1 | Security / Data privacy | `apps/api/src/routes/g10.routes.ts:196-201` (payslips route); `apps/api/src/modules/g10/payrollEngineRepository.ts:123-160` (`EnginePayslip`/`EnginePayslipLine` fields) | The new self-service payslip route returns internal engine fields (`tenantId`, `entityId`, `runId`, `payslipId`, and each line's full `calcTrace` internal computation trace) directly on the wire, unlike the `toWireBankAccount`/`toWireAttendance` pattern established twice earlier this session for exactly this class of leak. | Live `api.dispatch()` GET on `/api/v1/payroll/employees/{id}/payslips` for a real seeded employee returned `tenantId: "11111111-...-111"`, `entityId: "22222222-...-201"`, `runId: "engine-run-000001"`, `payslipId: "engine-payslip-...-v1-L001"`, and a `calcTrace` object exposing `ruleVersion`, `calcMethod`, proration internals, and PT-slab probe values on every line — none of which are in the declared `PayslipLineView`/`PayslipHeaderView` client types (`hrmsClient.ts:296-313`). | Add a `toWirePayslipRecord()` (or per-field) stripping helper in `g10.routes.ts`, analogous to `toWireBankAccount`/`toWireAttendance`, that returns only the fields the client types declare (drop `tenantId`, `entityId`, `runId`, `payslipId` from the payslip header; drop `tenantId`, `entityId`, `payslipId`, `calcTrace` from lines, or gate `calcTrace` behind an explicit admin-only detail route/permission if it is wanted for support diagnostics). Apply the same treatment to the `ytd` route response if `EngineYtdStatement` ever grows an internal field (currently it does not: `payrollEngineService.ts:72-81` has no internal id/tenant field). | Yes — implementation-only route/response-shaping change, no contract/schema change. |
| F2 | MEDIUM/P2 | Quality / type-safety | `apps/web/src/api/hrmsClient.ts:296-319` | `PayslipHeaderView` and `PayslipLineView` do not match the real runtime wire shape returned by the API (see F1); the mismatch is silent because `request<T>()` performs an unchecked cast (`hrmsClient.ts:1227`) with no runtime validation. | Live dispatch response (see F1 evidence) contains `tenantId`/`entityId`/`runId`/`payslipId`/`calcTrace`/`version`/`paidDaysHundredths`/`lwpDaysHundredths`/`supersessionReason`/`recoveryHold`/`arrearRef`/`sequenceNo`(present, declared) — several undeclared extra fields plus `lineType` union in `PayslipLineView` omits `"LWP_RECOVERY"`, one of the five real `EnginePayslipLineType` values (`payrollEngineRepository.ts:21`). | Once F1's wire-stripping helper is added, update the two view interfaces to match the (now-narrower) intentional wire contract exactly, including adding `"LWP_RECOVERY"` to the `lineType` union so a real LWP-affected payslip renders correctly instead of falling through the component's plain string interpolation with an untyped value. | Yes — type-only correction alongside F1. |
| F3 | MEDIUM/P2 | Accessibility | `apps/web/src/modules/g10/MyPayslipsPanel.tsx:104-109` | The per-payslip "View breakdown" / "Hide breakdown" toggle button has an accessible name that changes with state but no `aria-expanded` attribute, so assistive-technology users get no programmatic indication of whether the associated breakdown list is currently shown. | `<button onClick={...} type="button">{expandedId === record.payslip.id ? "Hide breakdown" : "View breakdown"}</button>` — no `aria-expanded={expandedId === record.payslip.id}`, and no `aria-controls` pairing to the rendered `<ul aria-label="Line-item breakdown for ...">` at line 112. | Add `aria-expanded={expandedId === record.payslip.id}` to the button, and optionally `aria-controls` pointing at an `id` on the breakdown `<ul>`, matching the disclosure-widget pattern (WCAG 4.1.2 / WAI-ARIA disclosure). | Yes — small, local JSX change. |
| F4 | LOW/P3 | Quality / defense-in-depth | `apps/web/src/modules/g10/MyPayslipsPanel.tsx:16-22` | `resolveEmployeeId` still contains the "fall back to the first employee in the tenant" pattern that the task description itself identifies as wrong for a strictly self-scoped read; it is unreachable today only because `App.tsx:182` always supplies `sessionEmployeeId`, but the component has no guard against being reused/rendered without that prop in a future call site. | `MyPayslipsPanel.tsx:16-22` (`resolveEmployeeId` unconditionally calls `client.listEmployees()` and uses `items[0]?.id` when `employeeId` is undefined); the server-side `assertSelfOrOverride` (`payrollEngineService.ts:656-662`) would still correctly reject a mismatched identity, so this is not an exploitable security hole today — it is a latent UX/correctness footgun for any future integrator who mounts the panel without wiring the session id. | Either make `employeeId` a required prop (drop the optional `?` and the fallback branch entirely) so a missing identity is a compile-time error, or leave as an accepted low-risk deferral since the server enforces the real boundary regardless. | Yes if the required-prop route is taken; otherwise route to backlog/accept. |

## Component substance check

| Component | File | Inputs | API calls | Data renders | Verdict |
|---|---|---|---|---|---|
| `MyPayslipsPanel` | `apps/web/src/modules/g10/MyPayslipsPanel.tsx` | `client: HrmsClient`, `employeeId?: string` | Real: `client.listMyPayslips(targetId)` + `client.getMyYtdStatement(targetId)` in parallel via `Promise.all`, against the real `GET /api/v1/payroll/employees/{id}/payslips` and `/ytd` routes | Renders real YTD gross/deductions/net figures, real payslip number/period/net-pay per record, and a real per-line component-code/line-type/amount breakdown on expand — all sourced from live server data, not hard-coded placeholders | Not a skeleton — real fields, real API calls, real loading/error/empty/ready state machine (mirrors `EmployeeBankAccountsPanel`'s canonical pattern) |
| `listMyPayslips` / `getYtdStatement` (service) | `apps/api/src/modules/g10/payrollEngineService.ts:583-661` | `ActorContext`, `employeeId` | N/A (service layer) | Derives real data from the append-only `payslip_lines` ledger (`VAL-G10-YTD-DERIVE`), not a cached/mock counter | Substantive; consistent with the rest of the engine's determinism guarantees |
| `seedTestPayrollLifecycle` | `apps/api/src/seed/testEmployeesSeed.ts:530-568` | in-memory services, `arjunEmployeeId`, `actor` | Drives the real engine lifecycle (enrol → create run → snapshot → compute → approve → lock) through the actual service methods, not a hand-inserted fixture row | Produces one real PUBLISHED payslip with real computed lines | Substantive; idempotent (see Checks run row) |

## Traceability impact

- No BRD/requirements artefact changes were made this session; the two new routes expose
  already-implemented, already-tested service methods (`listMyPayslips`, `getYtdStatement` — the
  latter pre-existing, now scope-hardened) per FR-G10-13 / FR-G10-06, consistent with
  `docs/reviews/brd-coverage-g10-payslip-self-service-2026-07-13.md`.
- F1/F2 do not require a contract or BRD amendment — they are implementation-only wire-shaping and
  type-accuracy fixes. No new error code, permission string, or state transition is implicated.
- The `renderRoute()` signature change in `App.tsx` (added `sessionEmployeeId` parameter) is a
  call-site-only change; no other caller of `renderRoute` exists outside `App.tsx` itself.

## Required amendments

None. All findings (F1-F4) are implementation-level repairs eligible for `--fix high+` or
`--fix all`; none require a requirements, contract, LLD, state-machine, or error-taxonomy amendment.

## Verification commands

```bash
# Typecheck (must stay clean after any fix)
npm run typecheck

# Full API test suite, or at minimum the G10 payslip + adjacent suites
node --test apps/api/test/payslip-self-service.test.cjs apps/api/test/ph09b-payroll-engine.test.cjs \
  apps/api/test/ph15a-g10-tax-tds.test.cjs apps/api/test/ph09d-compensation-integration.test.cjs

# Web typecheck + unit + e2e (after F1/F2 wire-shape fix, re-run to confirm the panel still renders
# correctly against the now-narrower response)
npm run web:typecheck
npm run web:test
npx playwright test --config apps/web/playwright.config.ts apps/web/test/e2e/payslip-self-service.spec.ts

# Live wire-shape spot-check after F1 fix (expect tenantId/entityId/runId/payslipId/calcTrace absent)
node -e "
const { createFoundationApi, createFoundationServices, ph03Ids } = require('./dist/apps/api/src');
const services = createFoundationServices({ seedTestEmployees: true });
const api = createFoundationApi(services);
const admin = { tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, userId: 'a', permissions: ['*'], roles: [], fieldGrants: ['*'] };
const arjun = services.employeeMaster.getByServiceNo(admin, 'GOV-100302');
const actor = { ...admin, userId: arjun.id, permissions: ['g10.payroll.read'] };
const r = api.dispatch({ method: 'GET', path: \`/api/v1/payroll/employees/\${arjun.id}/payslips\`, headers: {}, actor });
console.log(JSON.stringify(r.body, null, 2));
"
```

## Remaining risks

- **F1 (wire leak)** is the primary open risk: it does not expose another employee's data (the
  P02 self-or-override scope check is sound and correctly applied on both routes), but it does
  expose internal engine/tenancy identifiers and computation internals to the browser session of
  the record's own employee — a data-minimization gap rather than an authorization gap. Low
  exploitability, but should be closed before this is called production-ready given the
  established `toWireX()` convention exists specifically to prevent this class of leak.
- **F3 (aria-expanded)** is a real accessibility gap but low user-impact (the button's visible text
  already changes, so sighted users are unaffected; screen-reader users lose only the programmatic
  state signal, not the ability to operate the control).
- **Pre-existing, not-newly-introduced risks** (already documented, not re-litigated here): no PDF
  download, no version-history/diff viewer for reopened/superseded payslips, and the
  `g10.payroll.compute` vs. `g10.payroll.run.create` permission-string mismatch on the create-run
  route.
- **Dev-bridge auth caveat**: `PAYROLL_SELF_SERVICE_OVERRIDE_ROLES` (and the self-check itself)
  trusts `actor.roles`/`actor.permissions`, which in the current dev-only HTTP bridge
  (`tools/local-api-server.mjs`) are decoded from an unsigned bearer token. This is the same
  documented caveat as the G01/G03 SOD gates and is not a new issue introduced this session; it
  remains a real, tested control against any server-issued `ActorContext`, not yet a hard boundary
  end-to-end until a signed auth layer is in place.
