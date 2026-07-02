# PH-05 Verdict — UI Conformance and Review Packet (re-baselined)

Status: machine evidence GREEN; awaiting the PH-05E human UI/demo freeze decision.

Re-baselined 2026-07-02 after `docs/reviews/brd-coverage-audit-20260702.md`. The prior verdict
marker-matched words such as "accessibility" while module UIs were read-only metric cards behind a
wildcard grant and a fixture client. This packet reports what the re-baselined oracle
(`docs/spec/pipeline/checks/ph-05e.sh`) actually counted, per module, and names what is still missing.

## Oracle-computed state coverage

state_coverage: 14/14

The count above is copied verbatim from the oracle's own sweep: all 14 module surfaces under
`apps/web/src/modules/g01..g14` implement the canonical loading/error/empty branches. During this
sub-phase, 11 surfaces (G02–G11, G14) were converted from prop-drilled metric cards to the canonical
pattern already used by G01/G12/G13: injected `HrmsClient`, per-view state union
(loading/error/empty/ready via `modules/sliceViewState.ts`), and `OperationalState` rendering. Each
conversion traces to an oracle RED line from the pre-change run (g02..g11, g14 all RED on
"missing state branch(es): loading error empty").

## Per-module surface status

| Module | Surface | States implemented | API-backed | Guarded |
|---|---|---|---|---|
| G01 | EmployeeProfile.tsx | loading, error, empty, ready (masked-PII ready view) | GET /api/v1/employees + /employees/{id}/profile-360 | g01.employee.read |
| G02 | PersonalDetailsWorkspace.tsx | loading, error, empty, ready | GET /api/v1/personal-details/change-requests (NOT_FOUND maps to empty) | g02.change.read |
| G03 | LeaveWorkspace.tsx | loading, error, empty, ready | GET /api/v1/atl/leave-applications + leave-sr-outbox + payroll-signals | g03.leave.read |
| G04 | LeaveSrRelayWorkspace.tsx | loading, error, empty (total=0), ready | GET /api/v1/leave-sr/reconciliation | g04.relay.read |
| G05 | TransferWorkspace.tsx | loading, error, empty, ready | GET /api/v1/transfers/orders (NOT_FOUND maps to empty) | g05.transfer.read |
| G06 | PromotionWorkspace.tsx | loading, error, empty (zero counters), ready | GET /api/v1/promotions/summary | g06.promotion.read |
| G07 | TrainingWorkspace.tsx | loading, error, empty (sessions=0), ready | GET /api/v1/training/summary | g07.training.read |
| G08 | AparWorkspace.tsx | loading, error, empty (forms=0), ready | GET /api/v1/apar/summary | g08.apar.read |
| G09 | DisciplinaryWorkspace.tsx | loading, error, empty (cases=0), ready | GET /api/v1/disciplinary/summary | g09.case.read |
| G10 | PayrollWorkspace.tsx | loading, error, empty (structures=runs=0), ready | GET /api/v1/payroll/summary | g10.payroll.read |
| G11 | PensionWorkspace.tsx | loading, error, empty (cases=0), ready | GET /api/v1/pension/summary | g11.pension.read |
| G12 | ServiceRegisterTimeline.tsx | loading, error, empty, ready (cursor-paged load-more) | GET /api/v1/sr/employees/{id}/timeline | g12.sr.read |
| G13 | DocumentVaultView.tsx | loading, error, empty, ready | GET /api/v1/documents | g13.document.read |
| G14 | AnalyticsWorkspace.tsx | loading, error, empty (dashboards=cards=0), ready | GET /api/v1/analytics/summary | g14.analytics.read |

No-permission is handled one level up: `App.tsx` wraps every workspace in `RouteGuard` with a
module-specific permission (15 injected-client surfaces, 14+ `requiredPermission` guards, no
wildcard grant — `ph05-shell.test.cjs` asserts both). The fixture client exists only under
`src/api/` and tests; the composition root builds the real fetch client with the session-token
provider.

## Workflow inbox status

`workflow/WorkflowWorkspace.tsx` + `inboxState.ts` load GET /api/v1/workflow/tasks through the
injected client with loading/error/empty branches (oracle: all three ok). Task detail and action
panel cover approve/reject/send-back/delegate/cancel/query/advance with mandatory-reason
enforcement and Idempotency-Key headers on POST actions.

## Accessibility findings (what was actually checked)

Checked by source inspection and grep this run — not aspirational:

- Keyboard operability: every interactive control found is a native `<button type="button">`,
  `<button type="submit">`, or labelled `<input>`; no click handlers on non-interactive elements,
  no positive `tabIndex`, no custom focus traps (`tabIndex|autoFocus|.focus(` grep: zero hits).
- Form labelling: the login access-token input is bound via `label htmlFor="hrms-access-token"`.
- ARIA structure: workspace switcher uses `role="tablist"`/`role="tab"` with `aria-selected`;
  inbox rows use `aria-current`; action buttons use `aria-pressed`; every module article/section
  carries an `aria-label` (verified per file).
- State announcements: `OperationalState` sets `aria-live="assertive"` for error branches and
  `polite` for loading/empty, so branch transitions are announced without focus moves.
- Not done this phase (named honestly): no programmatic focus move to the error region on failure
  (aria-live compensates); no automated WCAG AA contrast audit of `styles.css` was run — contrast
  remains visually plausible but machine-unverified.

## Remaining gaps (named, with owning phases)

This wave is UI conformance, not module depth — the following are deliberately NOT closed here:

- G02–G11 and G14 remain read-only summary/proof panels. There are no create/edit forms (no leave
  application form, no transfer initiation, no APAR entry, no payroll run controls). Owning phases:
  PH-06 (G03/G05 vertical slices), PH-07 (G02/G04 employee wave), PH-08 (G06–G09 statutory wave),
  PH-09 (G10/G11 compensation wave), PH-10 (G14 analytics/release).
- G06–G11 and G14 have only a summary endpoint today; their states-conformant summary view is the
  accepted PH-05E shape. Per-record list/detail routes and their UIs are PH-08/PH-09/PH-10 scope.
- Empty state for summary-only modules is inferred from zero counts (not a distinct API signal).
- Single-page workspace layout: no per-module deep-linking/router yet; all surfaces render under
  one shell page behind guards.
- Automated contrast audit and focus-management polish, as noted above.

## Evidence

- Oracle: `bash docs/spec/pipeline/checks/ph-05e.sh` — GREEN, including this packet's honesty check.
- Suites (all green this run): `npm run typecheck`, `npm test` (API, 133 pass),
  `npm run web:typecheck`, `npm run web:test` (57 pass, includes the extended
  `ph05-ui-conformance.test.cjs` asserting canonical branches per module surface and client injection).

## Recommendation to the human gate

Approve the PH-05E UI freeze. Traceable basis: all 14 module surfaces implement real, API-backed
loading/error/empty branches behind per-module permission guards (state_coverage 14/14, fail-closed
negatives all green); the workflow inbox is operational end-to-end. The freeze should carry the
explicit caveat that G02–G11/G14 are read-only conformant surfaces whose transactional depth
(forms, per-record views) is owned by PH-06..PH-10, and that contrast/focus polish is an open
accessibility item for the module-depth waves.
