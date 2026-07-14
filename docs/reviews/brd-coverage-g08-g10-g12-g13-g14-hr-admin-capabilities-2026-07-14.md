# BRD Coverage — hr_admin G08/G10/G12/G13/G14 Remaining Capabilities

## Scope

The last task in the `hr_admin` role-capability audit: the 7 remaining named capabilities that
were not covered by the G01–G05 or cross-cutting tasks.

| Capability (user's naming) | Runtime | Status |
|---|---|---|
| G08 dual-control on APAR disposal/confidentiality downgrade | `g08.apar.sealed.release` + new `g08_dual_control` flag | Flag-enforcement gap fixed |
| `g10.fnf.settle` (sanction + pay stages) | `g10.fnf.settle` (existing) + new `sanctionFnfSettlement`/`payFnfSettlement` | Unbuilt stages, thin-built |
| `g12.sr.append` | `g12.sr.ingest` | Verified — already correctly gated, no change needed |
| `g13.document.store` | `g13.document.create` + `g13.retention.class.define` | Verified — already correctly gated, no change needed |
| `g13.letter.author` / "letter_admin" | new `g13.letter.author` (`LetterTemplateService`) | Unbuilt, thin-built |
| `g14.dashboard.view` | `g14.analytics.read` on `getDashboard()` | Verified — already built/tested, no change needed |
| `g14.report.build` | new `g14.report.build` (report definitions/build/schedule on `AnalyticsService`) | Unbuilt, thin-built |

## Findings

### G08 — `releaseSealedCover` had no dual-control check, fixed

`releaseSealedCover()` performs the confidentiality downgrade SEALED_COVER → DISCLOSURE (the
"APAR disposal and confidentiality downgrade" the audit names) but had no second-person-control
check at all — only the base `g08.apar.sealed.release` permission. Added the established
capability-flag-as-role-string check for `g08_dual_control`. Modeled as a single-actor-with-flag
capability, not a full two-step maker/checker workflow: sealed cover is set automatically at
case-open time via `underCharge`, so there is no natural "maker" identity to check a distinct
"checker" against (documented in-code).

### G10 — `g10.fnf.settle` sanction/pay stages did not exist, thin-built

The audit's "compute → sanction → approve → pay" flow only had compute (`settleFnf`) and approve
(`approveFnfSettlement`) implemented. Added two additive methods, gated on `g10.fnf.settle` plus a
capability-flag-as-role-string check each:
- `sanctionFnfSettlement` — requires `sanctioning_authority`/`hod`; SoD blocks the settlement
  creator from sanctioning their own settlement (mirrors the existing `FNF_SOD` pattern on
  `approveFnfSettlement`).
- `payFnfSettlement` — requires `payroll_officer`; only pays an `APPROVED` settlement; requires a
  non-empty `paymentRef`.

Both are additive fields/methods on `FnfSettlement` — the existing `COMPUTED`→`APPROVED`
transition and its tests are unchanged.

### G12 — `g12.sr.append` verified, no change needed

Maps exactly to the existing `POST /api/v1/sr/ingest` route (`operationId: g12.ingestServiceRegisterEvent`),
permission `g12.sr.ingest`. The service method (`ServiceRegisterService.ingest`) has no internal
`authorization.check` call — auth is enforced at the route/kernel layer, consistent with this
module's "canonical internal write port" pattern (other canonical-writer modules call `ingest`
directly in-process without a second gate). Verified end-to-end via HTTP dispatch: an actor without
`g12.sr.ingest` gets 403; an actor with it gets 201.

### G13 — `g13.document.store` verified, no change needed

Maps to a combination of `g13.document.create` (`createDocument()`) for storage and
`g13.retention.class.define` (`defineRetentionClass()`) for the "policy library, storage/retention
profiles" half of the capability. Both already exist, are already gated, and are exercised by
this task's test.

### G13 — `g13.letter.author` / letter_admin did not exist, thin-built

New `LetterTemplateService` (`apps/api/src/modules/g13/letterTemplateService.ts`), gated on
`g13.letter.author`:
- `authorTemplate`/`updateTemplate`/`listTemplates` — template CRUD with `{{field}}` merge-field
  placeholders.
- `generateLetter` — merges values into a template and stores the rendered letter via the
  **existing** `DocumentVaultService.createDocument()` (reused, not duplicated).
- `certifyGeneratedCopy` — certifies a generated letter; enforces generator ≠ certifier (SoD),
  mirroring the FnF/change-request SoD pattern used elsewhere this session.

Wired into `foundationServices.ts` (constructor injection, same pattern as
`backgroundVerification`/`biometricGovernance`) and routed at `POST /api/v1/letter-templates`,
`POST /api/v1/letter-templates/{id}`, `GET /api/v1/letter-templates`,
`POST /api/v1/letter-templates/{id}:generate`, `POST /api/v1/generated-letters/{id}:certify`,
`GET /api/v1/employees/{id}/generated-letters`.

### G14 — `g14.dashboard.view` verified, no change needed

Maps to the existing `GET /api/v1/analytics/dashboards/executive-readiness` route, permission
`g14.analytics.read`, backed by `AnalyticsService.getDashboard()` — already built and already
exercised by pre-existing tests. Re-verified directly against the service (403 without the
permission, 200 with it).

### G14 — `g14.report.build` did not exist, thin-built

New methods on the existing `AnalyticsService`, gated on `g14.report.build`, reusing the existing
`buildCards()` mart-card infrastructure rather than introducing a parallel data model:
- `defineReport` — pick a named subset of existing card codes + output format (`JSON`/`CSV`);
  rejects unknown card codes.
- `listReportDefinitions`
- `buildReport` — renders the selected cards as JSON or CSV.
- `scheduleReport`/`listScheduledReports` — records a cron expression + recipient list against a
  report definition (distribution scheduling is recorded, not executed — no cron runner exists in
  this in-memory backend, consistent with the "thin version" scope decision).

Routed at `POST /api/v1/analytics/reports`, `GET /api/v1/analytics/reports`,
`POST /api/v1/analytics/reports/{id}:build`, `POST /api/v1/analytics/reports/{id}:schedule`,
`GET /api/v1/analytics/report-schedules`.

## Verification

- `npm run build` — clean.
- `node --test apps/api/test/hr-admin-g08-g10-g12-g13-g14-remaining.test.cjs` — 8/8 pass.
- `node --test apps/api/test/*.test.cjs` — full backend suite 705/705 pass (1 pre-existing
  unrelated skip) — zero regressions.

## Verdict

**GAPS-FOUND → remediated.** One capability-flag enforcement gap fixed (G08); two capabilities
thin-built from nothing (G10 sanction/pay stages, G13 letter authoring, G14 report builder — three
total unbuilt capabilities); three capabilities verified as already correctly implemented and
gated, no change needed (G12 sr.append, G13 document.store, G14 dashboard.view).
