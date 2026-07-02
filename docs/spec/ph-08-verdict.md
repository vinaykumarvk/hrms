# PH-08 Verdict — Statutory Administration Wave (honest re-issue)

**Date:** 2026-07-02 (PH-08F, branch `ph02-rerun`)
**Baseline:** `docs/reviews/brd-coverage-audit-20260702.md` (the v3 G01–G14 line-item coverage audit)
**Status of this document:** replaces the prior PH-08 verdict, which self-certified coverage that the
audit showed did not exist. This verdict is a coverage **delta against the audit**, not a completion claim.

## Gate framing — read this first

The PH-08F oracle (`docs/spec/pipeline/checks/ph-08f.sh`) being GREEN is **necessary, not sufficient**.
It verifies that the statutory-wave UI surfaces are real (forms that submit to real routes, canonical
loading/empty/error states, behavioural web tests) and that all four suites pass. It does **not** verify
BRD completeness. The gate for PH-08 is **HUMAN**: a reviewer must read this verdict, weigh the remaining
NOT_FOUND items below, and decide whether to progress. This agent does not self-approve.

## What the audit found (baseline)

The 2026-07-02 audit traced ~1,400 BRD v3 line items and found ~9% CONFIRMED, with two inversions
relevant to PH-08: (a) every module's web surface was a read-only metric card — the "no skeleton UI"
rule inverted — and (b) module `ERR-Gxx-*` domain codes were not emitted. Audit baseline for this wave:

| BRD | Audited items | CONFIRMED | PARTIAL | NOT_FOUND (audit) |
|---|---:|---:|---:|---:|
| G05 Transfer/Relieving/Joining | 34 (FR grain) | 9 | 6 | 19 |
| G06 Promotion/Posting | 108 | 9 | 12 | 87 |
| G07 Training | 118 | 8 | 6 | 104 |
| G08 Performance/APAR | 22 FR | 2 | 4 | 16 |
| G09 Disciplinary | 96 | 12 | 9 | 75 |

## Coverage delta — what PH-08A–F closed since the audit

The rows below state the delta qualitatively with file evidence. The line-item counts have **not** been
re-audited; recertifying numbers requires a fresh `brd-coverage` run (recommended below). Claims here are
limited to what the re-baselined oracles PH-08A..F verify behaviourally.

### G05 — delta: API depth (PH-08B); UI unchanged in PH-08F

- Closed since audit: charge handovers incl. under-protest, distance-band joining time, deputation
  tenure caps + repatriation, served-on/deemed service gate, quarter penal-rent flip, with BRD-named
  codes thrown (`apps/api/src/modules/g05/`, oracle `ph-08b.sh`). UI already had a real initiate form +
  orders list from PH-06D (`apps/web/src/modules/g05/TransferInitiateForm.tsx`).
- Remaining NOT_FOUND: representation/retention/cancellation/deemed-relief **UI** verbs; transfer
  policy masters UI; most of the 19 audit NOT_FOUND items not named by the PH-08B oracle.

### G06 — delta: promotion depth (PH-08C) + DPC screens (PH-08F)

- Closed since audit: QSL-backed eligibility + APAR usability gate, zone of consideration, reservation
  rosters with own-merit migration, refusal debarment, probation auto-creation, sub-judice gate, real
  domain codes (`QUORUM_NOT_MET`, `PANEL_CONFLICT_OF_INTEREST`, …) as thrown values
  (`apps/api/src/modules/g06/`, `apps/api/src/routes/g06.routes.ts`).
- PH-08F UI: DPC convening screen with **per-member verdict capture** (each member's participate/recuse
  stance recorded row-by-row, live quorum position, recusals submitted as `recusedEmployeeIds`, panel
  verdict + per-candidate fitness rendered from the API response) —
  `apps/web/src/modules/g06/DpcConvenePanel.tsx`, wired to `POST /api/v1/promotions/cases/{id}:hold-dpc`.
- Remaining NOT_FOUND: the API persists the recusal list and a **panel-level** verdict only — an
  individual per-member vote record is not a PH-08A..E route (UI captures the stance; the server does
  not store it per member). Also missing: seniority-list authoring UI, roster/rota-quota UI, MACP UI,
  and the majority of the 87 audit NOT_FOUND items.

### G07 — delta: training depth (PH-08D) + nomination UI (PH-08F)

- Closed since audit: competency taxonomy, versioned Gap Contract (FR-G07-024), `lapsed_mandatory`
  certification expiry job, campaign engine basics (`apps/api/src/modules/g07/`,
  `apps/api/src/routes/g07.routes.ts`).
- PH-08F UI: training nomination form submitting `POST /api/v1/training/nominations` with capacity
  feedback (WAITLISTED + position) and eligibility errors rendered readable —
  `apps/web/src/modules/g07/TrainingNominationForm.tsx`.
- Remaining NOT_FOUND: campaign targeting/escalation UI, skill-inventory and gap-analysis UI,
  certification renewal UI, and most of the 104 audit NOT_FOUND items.

### G08 — delta: APAR depth (PH-08D) + tier forms (PH-08F)

- Closed since audit: appraisal cycles/templates/rating scales, WSUM weightage lock
  (`ERR-G08-WEIGHTAGE`), disclosure + representation window (`ERR-G08-REPWINDOW`), multi-RO
  part-periods, SLA escalation (`apps/api/src/modules/g08/`, `apps/api/src/routes/g08.routes.ts`).
- PH-08F UI: self-appraisal, RO assessment (grade + narrative via `:report`), and RvO review
  (concur + remarks via `:review`) as real forms **gated by the actor's tier permission** — an
  appraisee without `g08.apar.report`/`g08.apar.review` never sees RO/RvO authoring controls (SoD in
  the UI) — `apps/web/src/modules/g08/AparTierForms.tsx`.
- Remaining NOT_FOUND: goal-setting/WSUM-lock UI, disclosure + representation UI, sealed-cover
  release UI, AA acceptance UI, and the balance of the 16 audit NOT_FOUND FRs.

### G09 — delta: due-process depth (PH-08E) + case workbench (PH-08F)

- Closed since audit: preliminary inquiry, suspension + subsistence bounds, show-cause with DI-4
  penalty subset, authority competence incl. the Art. 311 guard, consultation gate, disagreement memo,
  timeline hash chain + verify, abatement on death, with `ERR-G09-*` as real thrown values
  (`apps/api/src/modules/g09/`, `apps/api/src/routes/g09.routes.ts`).
- PH-08F UI: case workbench with complaint/case **intake form** and article-of-**charge form**, case
  list with due-process stage visibility, domain codes (`ERR-G09-AUTHORITY-NOT-COMPETENT`,
  `ERR-G09-CASE-ABATED`, competence conflicts) rendered as readable messages —
  `apps/web/src/modules/g09/DisciplinaryCaseWorkbench.tsx`.
- Remaining NOT_FOUND: the API exposes **no case-list read route**, so the workbench list is
  session-local (cases opened in this session only); inquiry/penalty/appeal/suspension/show-cause UI
  verbs; POSH; and most of the 75 audit NOT_FOUND items.

## Remaining NOT_FOUND accounting (owners)

| # | Remaining NOT_FOUND area | Modules | Owner |
|---|---|---|---|
| 1 | Bulk of audited line items (~1,170 across G01–G14; the PH-08 wave closed a bounded subset above) | all | Pipeline owner — subsequent gated waves; re-run `brd-coverage` to recount |
| 2 | Case/list read routes for G09 (workbench list is session-local) and other missing read surfaces | G09 | API owner — requires re-opening PH-08B..E scope; escalated here, not papered over |
| 3 | Per-member DPC vote persistence (server stores recusal list + panel verdict only) | G06 | API owner — BRD interpretation decision at the human gate |
| 4 | UI verbs beyond the PH-08F set (G05 representation/retention, G06 seniority/roster/MACP, G07 campaigns/gap, G08 goals/disclosure/sealed-cover, G09 inquiry/penalty/appeal) | G05–G09 | Next UI wave (PH-08F follow-on), sized by the reviewer |
| 5 | Persistence: most module stores remain in-memory (PH-08A persisted sanctioned_posts + QSL only) | all | Persistence hardening phase |
| 6 | Jobs (`JOB-Gxx-*` scheduling) and statutory notification templates | all | Platform owner — later phase |

## Evidence

- UI: `apps/web/src/modules/g09/DisciplinaryCaseWorkbench.tsx`, `apps/web/src/modules/g06/DpcConvenePanel.tsx`,
  `apps/web/src/modules/g08/AparTierForms.tsx`, `apps/web/src/modules/g07/TrainingNominationForm.tsx`,
  mounted behind route guards in `apps/web/src/App.tsx`.
- Client: `apps/web/src/api/hrmsClient.ts` (statutory action routes + Idempotency-Key POSTs),
  `apps/web/src/api/fixtureHrmsClient.ts` (stateful fixtures incl. quorum/tier/capacity failure paths).
- Tests: `apps/web/test/ph08f-statutory-ui.test.cjs` (19 tests: submit-path wiring, real-client route
  behaviour incl. a QUORUM_NOT_MET error envelope, fixture flows, rendered empty/error states and SoD
  tier gating). Suites at verdict time: **API 226 tests / 225 pass / 1 skip; web 100 tests / 100 pass**;
  `npm run typecheck` and `npm run web:typecheck` clean.
- Oracles: `bash docs/spec/pipeline/checks/ph-08a.sh` … `ph-08f.sh`.

## Recommendation

Present this packet at the human gate. If approved, proceed to PH-09 (compensation wave) while item 2
(missing read routes) and item 3 (per-member vote persistence) are dispositioned explicitly by the
reviewer — either accepted as-is or queued as amendments. A fresh `brd-coverage` re-run is recommended
after the human gate to recertify per-module counts against `docs/reviews/brd-coverage-audit-20260702.md`.
