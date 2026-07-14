# BRD Coverage — G09 Disciplinary Case Self-Service

## Scope

Per the established scoping decision (BRD coverage scoped to the named use case, not the full
20-FR G09 module): this audit covers **only** "View/respond to a disciplinary or vigilance case
against you" — specifically:

1. **View my case status**: `GET /api/v1/disciplinary/employees/{id}/cases` (new),
   `GET /api/v1/disciplinary/cases/{id}/case-timeline`,
   `GET /api/v1/disciplinary/cases/{id}/evidence` (served-only for self-service),
   `GET /api/v1/disciplinary/cases/{id}/show-cause-notices` (new),
   `GET /api/v1/disciplinary/cases/{id}/personal-hearings`,
   `GET /api/v1/disciplinary/penalty-orders/{id}`.
2. **Respond to a show-cause notice**: `POST /api/v1/disciplinary/show-cause-notices/{id}:respond`.
3. **Request a personal hearing**: `POST /api/v1/disciplinary/cases/{id}:personal-hearing`.

Out of scope (admin/inquiry-authority flows, unaffected by this feature): case initiation, charge
memo service, preliminary inquiry, suspension ordering, inquiry report recording, disagreement
memo, mandatory consultation, show-cause *issuance*, POSH ICC constitution, penalty
finalisation, appeal *decision*, vigilance clearance, SLA pause/resume, audit-chain verification.
Also out of scope: filing an appeal (BRD grants `Employee: C` on this per §3.2, a distinct,
larger capability not named in this use case) and any case-analytics view.

**BRD reference:** `docs/brd/v3/G09-disciplinary-cases-punishment.md` (v3.0). Sections read in
full: §3.2 permission matrix, §3.3 field-level confidentiality rules, FR-G09-005 (statement of
defence + rights/deadlines surface).

## Traceability

| Item | BRD evidence | Code evidence | Verdict |
|---|---|---|---|
| Employee can view own case(s) | §3.2 implied by every "Employee (Charged): R(own)" row across the module; no explicit "list my cases" row exists in the BRD (its illustrative API only shows per-case endpoints), but the capability is a precondition for every other R(own) row to be reachable | New `listMyCases(actor, employeeId)` in `disciplinaryService.ts`, self-or-override gated; route `GET /api/v1/disciplinary/employees/{id}/cases` | DONE (net-new — BRD implies but doesn't name this discovery endpoint; see Finding F1) |
| Evidence vault: served artefacts only | §3.2 "Manage evidence vault: Employee (Charged) = **R(own, served only)**"; §3.3: "may read only artefacts that have been formally served... never the preliminary inquiry report... except relied-upon material, which must be disclosed" | `listCaseEvidence(actor, caseId)` — self-or-override gated; non-override callers filtered to `isServed: true` only, so the (always-unserved-by-default) `INQUIRY_REPORT` entry never appears | DONE — see Finding F2 for the "relied-upon" simplification |
| Case timeline visible to charged officer | §3.2 "Conduct inquiry / record hearings: Employee (Charged) = **R(own)**" (timeline is the append-only record of these events) | `listCaseTimeline(actor, caseId)` — self-or-override gated | DONE |
| Show-cause notice visible before responding | §3.2 "Issue show-cause notice: Employee (Charged) = **R(own)**" | New `listMyShowCauseNotices(actor, caseId)`; route `GET /api/v1/disciplinary/cases/{id}/show-cause-notices` | DONE (net-new read, same reasoning as F1) |
| Submit representation against show-cause | §3.2 "Submit statement of defence: Employee (Charged) = **C**"; FR-G09-005 AC1/BR-3: "Only the charged officer... may submit" | `respondToShowCause(actor, noticeId, ...)` — now self-or-override gated (was previously ungated — see Finding F3) | DONE |
| Personal hearing: request + status | §3.2 "Hold / record personal hearing: Employee (Charged) = **R(own)**"; FR-G09-005 AC6: "requesting a personal hearing records `requests_personal_hearing=true`" | `requestPersonalHearing` (now self-or-override gated — Finding F3) + `listPersonalHearings` (now self-or-override gated — Finding F4) | DONE |
| Penalty order visible to charged officer | §3.2 "Pass penalty/exoneration order: Employee (Charged) = **R(own)**" | `getPenaltyOrder(actor, id)` now self-or-override gated (Finding F4); **not wired into the self-service UI panel** — the seeded case stops at SHOW_CAUSE stage (no penalty order exists yet) | PARTIAL — backend self-scope correct; UI section deferred (disproportionate to add a UI section with no reachable seed data for this use case's scope) |
| Wire responses strip internal fields | Platform-wide convention | `toWireDisciplinaryCase`/`toWireShowCauseNotice`/`toWirePersonalHearing`/`toWirePenaltyOrder` in `g09.routes.ts`, applied to every touched/new route | DONE |
| Cross-employee ownership enforcement | §3.2 header pattern: every "Employee (Charged)" row is qualified `(own)`, never unqualified `R` | `DISCIPLINARY_ACCESS_OVERRIDE_ROLES`, `isDisciplinaryAccessOverride`, `assertSelfOrDisciplinaryOverride` — applied to all 7 touched/new methods | DONE (was a real, severe gap — see Findings) |

## Findings

### F1 (net-new capability, not a gap) — `listMyCases`/`listMyShowCauseNotices` discovery endpoints

The BRD's own illustrative API tables never list a "GET my cases" or "GET my show-cause notices"
endpoint — its per-FR API tables only show case-scoped sub-resource routes (e.g.
`GET /api/v1/dcp/cases/{id}/my-rights`), implicitly assuming the caller already has a `caseId`.
Without a discovery endpoint, an employee has no way to learn their own case's id at all. Building
`listMyCases` (and its show-cause-notice analogue) was necessary to make every other BRD-granted
`R(own)` row actually reachable by a self-service caller. Not a deviation — a load-bearing
prerequisite the BRD's illustrative routes didn't spell out.

### F2 (LOW, documented simplification) — "relied-upon" evidence disclosure not modelled

§3.3: preliminary inquiry material is withheld from the charged officer "except any PI/sealed
material **relied upon as evidence** in the inquiry, which must be disclosed
(`relied_upon=true ⇒ disclosed=true`)." The current `listCaseEvidence()` implementation hardcodes
`INQUIRY_REPORT` as `isServed: false` unconditionally — there is no `relied_upon` flag anywhere in
the `DisciplinaryCase`/evidence model. This is a **conservative, fail-closed simplification**: the
self-service filter never over-discloses (it can only ever under-disclose a document that BRD says
should sometimes be shown), so there is no security regression — but it means a real "relied-upon
PI report" scenario would incorrectly stay hidden from the employee even when the BRD requires
disclosure. Flagged, not fixed: modelling `relied_upon`/`disclosed` as first-class fields on
evidence rows is a data-model change affecting `recordInquiryReport`/`finaliseOrder`, well beyond
this use case's scope (self-service reads only, no write-side model changes).

### F3-F4 (CRITICAL, pre-existing, fixed during this implementation)

| ID | Severity | Finding | Fix |
|---|---|---|---|
| F3 | CRITICAL | `respondToShowCause` and `requestPersonalHearing` had **no ownership check at all** — any actor holding the ordinary `g09.show-cause.respond`/`g09.personal-hearing.request` permission (which every self-service employee session now carries) could submit a defence representation or request a hearing **on behalf of a case that was not theirs**, effectively impersonating the actual respondent in due-process actions with real legal consequences. | Both now call `assertSelfOrDisciplinaryOverride(actor, disciplinaryCase.chargedEmployeeId)` before proceeding |
| F4 | CRITICAL | `listCaseTimeline`, `listCaseEvidence`, `listPersonalHearings`, `getPenaltyOrder` had **no ownership check at all** — any `g09.case.read` holder could read any employee's case timeline, evidence, hearing requests, or penalty order — the most sensitive category of PII in this entire codebase (disciplinary/vigilance detail). | All four now self-or-override gated |
| F5 | HIGH, pre-existing route/service permission-string mismatch (fixed) | `POST /api/v1/disciplinary/show-cause-notices/{id}:respond` declared route-level `permission: "g09.showcause.issue"` (the **DA's issue permission**) while the service internally checked `g09.show-cause.respond` (the respondent's permission) — a caller needed **both**, meaning a self-service employee granted only the correct `g09.show-cause.respond` permission would have been blocked at the route gate before ever reaching the (correct) service-level check. Masked in every existing test by wildcard-permission actors. | Route's declared permission corrected to `g09.show-cause.respond` |
| F6 | MEDIUM, pre-existing route/service permission-string mismatch (fixed) | `GET /api/v1/disciplinary/cases/{id}/case-timeline` declared route-level `permission: "g09.case.read"` while the service internally checked `g09.timeline.read` — same double-permission trap. | Service's internal check aligned to `g09.case.read`, matching every other case-scoped read in the module |

All of F3-F6 were found and fixed **during this feature's own implementation** (necessary to make
the self-service demo employee session — granted only the minimal, correct permissions, not a
wildcard — actually work end-to-end), not deferred to a separate review pass. Recorded here for
traceability, following the same pattern established for G05 (`getServiceRecord`) and G06
(`listPromotionOrders`/`listSealedCovers`) earlier in this session.

## Deferred/out-of-scope gaps (not remediated — outside this use case)

- **Penalty order self-service UI**: backend (`getPenaltyOrder`) is self-scope-correct, but no UI
  section renders it, since the seeded case (stopped at SHOW_CAUSE by design, to keep the
  respond/request-hearing actions live-exercisable rather than pre-seeded-done) never reaches a
  penalty order. Would need a case seeded through to `finaliseOrder` to exercise meaningfully — a
  disproportionate addition for this use case's scope.
- **Filing an appeal** (§3.2 "File appeal: Employee (Charged) = C"): a distinct, larger capability
  (FR-G09-012) with its own workflow, not named in this use case's wording ("view/respond to a
  case", not "appeal a decided case"). Flagged for a future self-service slice if wanted.
- **"Rights & Deadlines" surface** (FR-G09-005 AC6, v2 UI upgrade): the BRD calls for a dedicated
  panel showing entitlements and live countdown timers (defence window, appeal limitation). The
  panel built here shows the underlying data (response due date, hearing status) inline but does
  not build the dedicated countdown/entitlements UI the BRD names as a v2 upgrade. Flagged as a UX
  enhancement opportunity, not a functional gap — every datum the BRD's rights panel would show is
  already present in the plain rendering.
- **F2's `relied_upon`/`disclosed` evidence-model gap** (see Finding F2 above) — data-model change,
  out of this read-only self-service use case's scope.

## Verdict

**GAPS-FOUND → remediated within this session's implementation.** Four real, severe findings
(F3-F4 CRITICAL cross-employee impersonation/PII-leak gaps; F5-F6 HIGH/MEDIUM permission-string
mismatches that would have silently broken the self-service feature for a correctly-scoped
demo session) were found and fixed before this report was written. No unremediated gaps block
shipping; all deferrals are proportionate scope boundaries, not silently-dropped requirements.

## Verification

- `npm run build` — clean.
- `node --test apps/api/test/disciplinary-case-self-service.test.cjs` — 8/8 pass, including
  dedicated regression tests for F3 (respond/request-hearing impersonation), F4 (timeline/evidence/
  hearings cross-employee leak), and the served-only evidence filter (F2's conservative behavior).
- `node --test apps/api/test/*.test.cjs` — full backend suite 674/675 (1 pre-existing unrelated
  skip).
- `npm run web:typecheck` / `npm run web:test` — clean, 153/153.
- `npx playwright test --workers=1` — full e2e suite 33/33, including the new
  `disciplinary-case-self-service.spec.ts` (2 tests: self-view + respond + request-hearing live
  through the real UI, and cross-employee-denial via direct API).
