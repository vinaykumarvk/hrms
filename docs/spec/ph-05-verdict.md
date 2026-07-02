# PH-05 Verdict - Core UI Shell and Minimum Workflow Operations UI

Status: GREEN by machine evidence; pending PH-05E human UI/demo freeze approval.

## Verdict

PH-05 has produced the first usable HRMS shell over the frozen PH-04 API surface. The UI is intentionally fixture-backed at this stage, but the fixture adapter mirrors the PH-04 route families and response envelope names used by the typed client.

Recommended disposition: approve the PH-05E human gate if the workspace information architecture and fixture-mode caveats are acceptable for PH-06 vertical-slice development.

## Implemented Surface

HRMS shell: `apps/web/src/app/AppShell.tsx` provides the operational layout, primary navigation, route guard, and standard operational states.

Workspace behavior: `apps/web/src/app/WorkspaceSwitcher.tsx` exposes Me, My Team, and Admin workspaces.

P01 inbox and task operations: `apps/web/src/workflow/Inbox.tsx`, `TaskDetail.tsx`, and `TaskActionPanel.tsx` cover inbox, task detail, approve, reject, send-back, delegate, cancel, query, advance, mandatory reason enforcement, and audit history.

Workflow config: `apps/web/src/workflow/WorkflowConfigConsole.tsx` and `workflowConfigModel.ts` provide a YAML-backed workflow config surface for validate, simulate, submit for review, publish, maker-checker, and evidence export.

G01: `apps/web/src/modules/g01/EmployeeProfile.tsx` shows profile-360 with masked PII and fieldGrants evidence.

G12: `apps/web/src/modules/g12/ServiceRegisterTimeline.tsx` shows append-only sequence, hash, and provenance cues.

G13: `apps/web/src/modules/g13/DocumentVaultView.tsx` shows document attachment, versions-oriented state, legal hold, WORM, retention, and fail-closed disposal messaging.

## Evidence

- Web typecheck/build/tests: `npm run web:check`.
- API regression: `npm run check`.
- PH-05D oracle: `bash docs/spec/pipeline/checks/ph-05d.sh`.
- PH-05E oracle: `bash docs/spec/pipeline/checks/ph-05e.sh`.

The current web test suite covers API-client route markers, fixture envelope shape, shell navigation, workspace controls, route guard metadata, P01 action markers, workflow config lifecycle markers, G01/G12/G13 record view markers, and accessibility attributes through `aria-label` checks.

## Fixture Mode

The UI is in fixture mode for PH-05. This is deliberate: PH-06 will prove live G03/G05 vertical slices after the UI shell and operations surface are accepted. The fixture adapter must be replaced or backed by live route calls as PH-06 introduces end-to-end flows.

## Accessibility And UX Notes

The shell and primary panels include semantic landmarks, buttons, labels, and `aria-label` coverage. The layout uses responsive grids so text and controls collapse to single-column mobile views.

## Residual Risks Before PH-06

- The web app does not yet run against a live HTTP server; it consumes the typed PH-04 route contract and fixture adapter.
- Advanced visual workflow graph editing remains deferred; the PH-05 workflow config surface is YAML-backed.
- PH-06 must replace fixture task/employee/SR/document data with live G03/G05 vertical-slice calls.

## Gate

PH-05E is a human UI/demo freeze gate. Approval means PH-06 can build G03 and G05 vertical slices on top of this shell, workflow operations UI, workflow config surface, and G01/G12/G13 foundation views.
