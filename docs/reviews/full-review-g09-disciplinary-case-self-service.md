# Full Review: G09 Disciplinary Case Self-Service

## Addendum 2026-07-14 (hr_admin cross-cutting SoD correction)

`DISCIPLINARY_ACCESS_OVERRIDE_ROLES` in `disciplinaryService.ts` no longer includes `hr_admin` —
per an explicit instruction from a later `hr_admin` role-capability audit ("hr_admin has no direct
grants in G09... a deliberate separation-of-duties boundary"), `hr_admin` was removed, leaving
only `disciplinary_authority`/`system`. This is a stronger boundary than the G09 module BRD's own
text implies (it names an "HR-DCP Admin" persona mapped to HR Admin, but gated on a distinct,
never-implemented "G09 module-admin entitlement" flag and scoped "operational, non-deciding") — the
newer cross-cutting instruction supersedes that older, looser language for this override set. This
session's own three `disciplinary-case-self-service.test.cjs` tests that asserted `hr_admin` as an
override actor were updated to assert `disciplinary_authority` instead (and to additionally assert
`hr_admin` is now correctly blocked). Full suite re-verified green after the change. Verdict
unchanged (PASS) — this is a scope-widening correction, not a defect in the original feature. A
concurrent independent full-review of the G14 personal-dashboard feature flagged this same test
breakage as a finding (F2) before this correction was applied; it is resolved as of this addendum.

## Verdict
PASS

Every ownership-scoping enforcement point (case discovery, timeline, evidence, show-cause
notices, personal hearings, penalty orders, respond/request-hearing writes) live-verified via
`api.dispatch()` probes beyond the existing 8-test suite — 24 additional adversarial probes
covering query-string/body parameter injection, role near-misses, case sensitivity, module-scoped
wildcard permissions, multi-role combinations, a non-override "named party" (the case's own
disciplinary authority) probing their own case, and a second independently-finalised cross-employee
case used to probe real penalty-order leakage (not just a 404-on-missing-id proxy) — all passed
with no bypass found. The served-only evidence filter cannot be defeated by any query/body
manipulation tested; `INQUIRY_REPORT` never appears for a non-override caller. No new findings.
The findings already documented in the BRD-coverage doc (F3-F6, fixed; F2, a deliberate
conservative simplification) remain correctly fixed/unchanged under this review's additional
probing.

## Scope
- **Target**: G09 Disciplinary Case Self-Service (`/me/disciplinary`) — the slice covering (1) view
  own case status (list, timeline, served-only evidence, show-cause notices, personal hearings),
  (2) respond to a show-cause notice, (3) request a personal hearing, per the BRD-coverage doc's
  scope decision. Admin/inquiry-authority flows (case initiation, PI, suspension, show-cause
  issuance, POSH ICC constitution, penalty finalisation, appeal decision, vigilance clearance) are
  explicitly out of scope, as is filing an appeal and case analytics.
- **Selected path**: Light/standard hybrid — reviewing an already-implemented, already-reviewed-once
  self-service slice; no new implementation performed (report-only, per full-review no-fix default).
- **Files reviewed**:
  - `apps/api/src/modules/g09/disciplinaryService.ts` (diff: `DISCIPLINARY_ACCESS_OVERRIDE_ROLES`,
    `isDisciplinaryAccessOverride`, `assertSelfOrDisciplinaryOverride`; new `listMyCases` and
    `listMyShowCauseNotices`; hardened `listCaseTimeline`/`listCaseEvidence`/`listPersonalHearings`/
    `getPenaltyOrder`/`respondToShowCause`/`requestPersonalHearing`; served-only evidence filter;
    `g09.timeline.read` → `g09.case.read` permission-string fix)
  - `apps/api/src/routes/g09.routes.ts` (new `toWireDisciplinaryCase`/`toWireShowCauseNotice`/
    `toWirePersonalHearing`/`toWirePenaltyOrder` wire-stripping helpers; new
    `GET /api/v1/disciplinary/employees/{id}/cases` and
    `GET /api/v1/disciplinary/cases/{id}/show-cause-notices` routes; the respond route's declared
    permission fixed from `g09.showcause.issue` to `g09.show-cause.respond`; hardened reads now pass
    `context.actor`)
  - `apps/api/src/seed/testEmployeesSeed.ts` (new `seedTestDisciplinaryCase`)
  - `apps/api/src/platform/foundationServices.ts` (wires the new seed call)
  - `apps/web/src/modules/g09/MyDisciplinaryCasePanel.tsx` (new self-service panel)
  - `apps/web/src/api/hrmsClient.ts` / `apps/web/src/api/fixtureHrmsClient.ts` (new types + client
    methods)
  - `apps/web/src/App.tsx`, `apps/web/src/app/navigation.ts`, `apps/web/src/app/session.ts` (new
    `/me/disciplinary` route + nav + demo permissions)
  - `apps/api/test/disciplinary-case-self-service.test.cjs` (8 backend tests)
  - `apps/web/test/e2e/disciplinary-case-self-service.spec.ts` (2 Playwright tests)
  - `apps/api/test/seed-five-employees.test.cjs` (updated Meera document-count expectation: 3, not 1)
- **Artefacts used**: `docs/reviews/brd-coverage-g09-disciplinary-case-self-service-2026-07-13.md`
  (read in full before this review; its F3-F4 CRITICAL findings — `respondToShowCause`/
  `requestPersonalHearing`/`listCaseTimeline`/`listCaseEvidence`/`listPersonalHearings`/
  `getPenaltyOrder` previously had zero ownership checks — and F5-F6 route/service permission-string
  mismatches, all fixed during implementation, plus F2's documented conservative
  never-served-by-default `INQUIRY_REPORT` simplification, are treated as known and not re-reported
  below except where this review found the fix incomplete). `docs/brd/v3/G09-disciplinary-cases-
  punishment.md` §3.3 (field-level confidentiality rules) re-read in full for this review, including
  the `is_confidential_source`/complainant-identity masking rule and the `relied_upon ⇒
  disclosed_to_charged` disclosure rule, neither of which is modelled as a field on the current
  `DisciplinaryCase`/evidence data shape. `docs/reviews/full-review-g06-promotion-posting-self-
  service.md` consulted as the reference report structure and sibling ownership-gate pattern.

## Checks run

| Check | Ran? | Result | Evidence |
|---|---|---|---|
| Read BRD-coverage doc for prior findings/deferrals | Yes | 4 remediated findings (F3-F4 CRITICAL, F5-F6 HIGH/MEDIUM) + 1 net-new-capability note (F1) + 1 deliberate simplification (F2) | `docs/reviews/brd-coverage-g09-disciplinary-case-self-service-2026-07-13.md` |
| Re-read BRD §3.3 field-level confidentiality rules directly from source | Yes | Confirmed: served-only artefacts, PI report withheld unless relied-upon, complainant identity masked, consultation advice restricted — none of the masked categories (complainant identity, vigilance notes, sealed-cover contents, DA deliberation, consultation advice) exist as fields on `DisciplinaryCase`/evidence in this codebase, so there is no field to leak; the one modelled category (`inquiryReportDocumentId`) is correctly withheld | `docs/brd/v3/G09-disciplinary-cases-punishment.md` §3.3 (lines 236-242) |
| Static diff review of `disciplinaryService.ts`/`g09.routes.ts` | Yes | Consistent `assertSelfOrDisciplinaryOverride`/override-role-Set pattern on all 6 hardened methods + 2 new self-service reads; `toWireX()` helpers applied to every touched/new route | `apps/api/src/routes/g09.routes.ts` lines with `toWireDisciplinaryCase`/`toWireShowCauseNotice`/`toWirePersonalHearing`/`toWirePenaltyOrder` |
| Live wire-payload capture of `listMyCases` for the charged employee | Yes | Full `DisciplinaryCase` row (minus `tenantId`/`entityId`/`workflowInstanceId`) crosses the wire; `inquiryReportDocumentId` correctly `undefined`; no BRD §3.3-masked field present because none is modelled | `node -e` probe against `/api/v1/disciplinary/employees/{id}/cases`, captured JSON |
| Live probe: existing regression suite (F3-F6 coverage) | Yes | PASS 8/8 | `apps/api/test/disciplinary-case-self-service.test.cjs` |
| **New** live probe: query-string/body parameter injection (`employeeId`/`chargedEmployeeId` spoofed on timeline; `artefactType`/`isServed`/`includeAll` spoofed on evidence) | Yes | PASS — router 404s unmatched query-string paths (fails safe); body-param spoofing ignored, ownership gate still enforced | scratchpad `g09-probe.js`, checks 2-3, 15-16 |
| **New** live probe: cross-employee reads of timeline/evidence/personal-hearings/show-cause-notices by a stranger holding the correct `g09.case.read` permission | Yes | PASS — all 403 | scratchpad `g09-probe.js`, checks 4, 6-7 |
| **New** live probe: `respondToShowCause`/`requestPersonalHearing` invoked by a stranger holding the exact correct write permission and a valid id | Yes | PASS — both 403, impersonation blocked | scratchpad `g09-probe.js`, checks 8-9 |
| **New** live probe: near-miss override role strings (`hr_admin_readonly`, `disciplinary_authority_readonly`) and case-sensitivity (`HR_ADMIN`) | Yes | PASS — none treated as override | scratchpad `g09-probe.js`, checks 10-12 |
| **New** live probe: module-scoped wildcard permission (`g09.*`) vs literal `"*"` | Yes | PASS — only literal `"*"` or an actual override role triggers bypass; `g09.*` does not | scratchpad `g09-probe.js`, check 13 |
| **New** live probe: multi-role actor (one override role among several) | Yes | PASS — any-of semantics confirmed intentional | scratchpad `g09-probe.js`, check 14 |
| **New** live probe: the case's own disciplinary authority (a real, named party on the case, but not holding an override role) attempts to read the case timeline | Yes | PASS — 403, denied exactly like a stranger; being named on the case is not itself an access grant | scratchpad `g09-probe.js`, check 18 |
| **New** live probe: real cross-employee penalty-order leak (independent second case opened/charged/inquiry/show-cause/finalised end-to-end for a different employee) read by an unrelated stranger vs. the actual respondent vs. an hr_admin override | Yes | PASS — stranger 403, respondent 200 (own only), hr_admin 200 (override); wire strips `tenantId`/`entityId` | scratchpad `g09-probe2.js`, checks 1-4 |
| `MyDisciplinaryCasePanel.tsx` component-substance / anti-skeleton check | Yes | PASS — real `Promise.all`-chained sequential fetch (cases → notices+hearings), real loading/error/empty/ready state machine, real controlled form with required-field validation, real conditional rendering (respond form only when `SERVED`/`ISSUED`; hearing-request button only when no hearing exists yet), real error-code-to-message mapping for both write paths | `apps/web/src/modules/g09/MyDisciplinaryCasePanel.tsx:53-231` |
| `npm run build` | Yes | PASS, clean | command output empty (success) |
| `node --test apps/api/test/disciplinary-case-self-service.test.cjs` | Yes | PASS 8/8 | `# tests 8 / # pass 8 / # fail 0` |
| Full backend suite `node --test apps/api/test/*.test.cjs` | Yes | PASS 674/675 (1 pre-existing unrelated skip) | `# tests 675 / # pass 674 / # fail 0 / # skipped 1` |
| `npm run web:typecheck` | Yes | PASS, no errors | command output empty (success) |
| `npm run web:test` | Yes | PASS 153/153 | `# tests 153 / # pass 153 / # fail 0` |
| Seed idempotency: `seedTestDisciplinaryCase` invoked a second time against an already-seeded live services instance | Yes | PASS — case count for Meera stayed 1 after a repeat call | scratchpad `g09-probe2.js`, check 5 |
| Seed realism: confirm `serveChargeMemo`/`recordInquiryReport` genuinely create real documents (explains the `seed-five-employees.test.cjs` 1→3 document-count change) | Yes | Confirmed — both call `documentVault.createDocument(...)` + `attach(...)`, real cross-module side effects, not stubs; matches the seed's own docstring | `apps/api/src/modules/g09/disciplinaryService.ts:258-279` (serveChargeMemo), `:294-311` (recordInquiryReport) |
| Seed stage correctness: seeded case stops at `INQUIRY_REPORT` stage (BRD-coverage doc calls this "SHOW_CAUSE stage" informally) | Yes | Confirmed — `issueShowCauseNotice` never mutates `disciplinaryCase.stage`, so the case row's `stage` field legitimately stays `INQUIRY_REPORT` even after a show-cause notice exists; matches the test's own assertion, not a defect | `apps/api/src/modules/g09/disciplinaryService.ts:566-596`; `apps/api/test/disciplinary-case-self-service.test.cjs:42` |
| Playwright e2e spec review (`disciplinary-case-self-service.spec.ts`) | Yes (static only, not executed — no browser runtime in this session) | Exercises the real due-process lifecycle via HTTP (open → charge → inquiry-report → show-cause), then the real UI panel via a real session token with the exact minimal permission set (`g09.case.read`, `g09.show-cause.respond`, `g09.personal-hearing.request`); second test independently re-confirms cross-employee denial through the raw API | `apps/web/test/e2e/disciplinary-case-self-service.spec.ts:65-99` |
| Nav/session/route wiring cross-check | Yes | `/me/disciplinary` nav entry requires `g09.case.read`; demo session grants exactly the three minimal permissions the panel/e2e spec need, nothing broader | `apps/web/src/app/navigation.ts:40`, `apps/web/src/app/session.ts:25` |

## Findings

No new findings. All 24 additional adversarial live probes (19 + 5) passed; the served-only
evidence filter and `inquiryReportDocumentId` stripping hold under every parameter-manipulation
variant tested, including against a second, independently-finalised cross-employee case (not just
the shared seeded one); `MyDisciplinaryCasePanel.tsx` has real substance; the seed function is
realistic (real due-process lifecycle, real cross-module document creation) and idempotent.

Findings already known and intentionally not re-reported here (per the BRD-coverage doc):

- **F2 (LOW, documented simplification)** — the "relied-upon evidence" disclosure rule (BRD §3.3:
  `relied_upon=true ⇒ disclosed=true`) is not modelled; `INQUIRY_REPORT` is hardcoded
  `isServed: false` unconditionally for every case. Confirmed still fail-closed/conservative under
  this review's additional probing (checks 15-16 in `g09-probe.js`): no parameter manipulation
  makes it appear for a non-override caller. Re-reading BRD §3.3 directly for this review surfaced
  one adjacent point worth flagging for awareness (not a new finding, since it's a non-issue given
  current data model): the BRD's complainant-identity masking (`is_confidential_source`) and
  consultation-advice restriction rules have no corresponding field anywhere in `DisciplinaryCase`
  or the evidence shape, so there is structurally nothing for `toWireDisciplinaryCase` to leak on
  those two categories — but if a future slice adds a complainant/consultation field to the case
  row without deliberately excluding it from the wire helper, that would need the same
  self-or-override + masking treatment the PI report already gets.
- **F3-F4 (CRITICAL, pre-existing, fixed during implementation)** — six methods had zero ownership
  checks. Re-verified fixed and holding under this review's additional adversarial probes (role
  near-misses, case sensitivity, parameter injection, module-scoped wildcards, a named-but-
  non-override case party, and a real second cross-employee penalty order), none of which were part
  of the original 8-test regression suite.
- **F5-F6 (HIGH/MEDIUM, pre-existing, fixed during implementation)** — route/service
  permission-string mismatches on the respond and case-timeline routes. Confirmed the demo e2e
  session (`g09.show-cause.respond`, `g09.case.read` only, no wildcard) exercises both routes
  successfully end-to-end, which would have failed under the pre-fix mismatch.

## Component substance check

| Component | File | Inputs | API calls | Data renders | Verdict |
|---|---|---|---|---|---|
| `MyDisciplinaryCasePanel` | `apps/web/src/modules/g09/MyDisciplinaryCasePanel.tsx` | `client: HrmsClient`, `employeeId: string`, `refreshToken: number` (props) | `client.listMyDisciplinaryCases(employeeId)`, then (if a case exists) `client.listMyShowCauseNotices(caseId)` + `client.listMyPersonalHearings(caseId)` via `Promise.all`; `client.respondToShowCause(...)` and `client.requestPersonalHearing(...)` on user action — 4 real call paths, no mock data | Real `<ul>` case/notice/hearing lists keyed by record id; respond form renders only when a notice is `SERVED`/`ISSUED` (state-driven, not static) and shows the submitted `representationText` afterward instead of the form; hearing section shows a live "Request a personal hearing" button only when no hearing row exists yet, else renders status/denial-reason/scheduled-date conditionally | **Real component** — full `loading`/`error`/`empty`/`ready` state machine, separate `ResponsePhase`/`HearingPhase` submission state machines with per-error-code message mapping, controlled required-field textarea, no hard-coded data paths |

## Traceability impact

No traceability changes required — this is a review-only pass with no code edits. The
BRD-coverage doc's traceability table (§ Traceability) remains accurate; this review adds
independent live verification on top of it.

## Required amendments

None. No finding in this review requires a requirements/contract/LLD amendment.

## Verification commands

```bash
npm run build
node --test apps/api/test/disciplinary-case-self-service.test.cjs
node --test apps/api/test/*.test.cjs   # full backend suite
npm run web:typecheck
npm run web:test
```

Results as run in this review: `build` clean; targeted suite 8/8; full backend suite 674/675 (1
pre-existing unrelated skip); `web:typecheck` clean; `web:test` 153/153. Additionally, two ad hoc
adversarial `api.dispatch()` scripts (not part of the committed test suite) ran 19/19 and 5/5 pass
respectively — 24 total probes covering parameter injection, role/permission near-misses, case
sensitivity, multi-role combinations, a named-but-non-override case party, and a real independent
second cross-employee case used to verify penalty-order leakage beyond the 404-on-missing-id case
the committed suite covers. A separate idempotency check confirmed `seedTestDisciplinaryCase`
produces no duplicate case on a second invocation against an already-seeded live services instance.

## Remaining risks

- The Playwright e2e spec was reviewed statically only (no browser runtime available in this
  session) — its assertions and flow are consistent with the panel's actual API surface and route
  wiring, but end-to-end browser execution was not re-verified here.
- F2 (relied-upon evidence disclosure not modelled) remains open by design, pending a future
  BRD-driven data-model change (`relied_upon`/`disclosed_to_charged` fields) — documentation-only
  scope boundary, not a code risk; confirmed conservative (never over-discloses) under this review's
  probing.
- The complainant-identity (`is_confidential_source`) and consultation-advice confidentiality rules
  in BRD §3.3 have no corresponding fields in the current data model, so they cannot currently leak
  — but this also means there is no enforcement code guarding them yet. If a future slice adds
  either field to `DisciplinaryCase` or a related read, it must get the same
  self-or-override-plus-masking treatment applied here, not be assumed safe by omission.
- This review's 24-probe adversarial scripts are not committed to the repository (ad hoc
  verification only); the existing 8-test suite already covers the primary self/stranger/override
  contrast for each read and write, so no regression-test gap is left uncovered by this review's
  additional probing.
