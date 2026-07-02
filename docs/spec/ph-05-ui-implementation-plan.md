# PH-05 Detailed Plan - Core UI Shell and Minimum Workflow Operations UI

Status: pipeline-ready plan, not executed.

## Objective

Build the first usable HRMS frontend over the PH-04 `/api/v1` contract: an authenticated operational shell, Me/My Team/Admin workspaces, P01 inbox and task action surfaces, a minimum YAML-backed workflow configuration review/publish/simulate surface, and read-only G01/G12/G13 foundation views.

PH-05 must not mass-build HRMS modules. It exists to make the platform usable before PH-06 proves G03 and G05 vertical slices.

## Entry Conditions

- PH-04D machine oracle is GREEN.
- PH-04D human API-freeze approval is recorded before PH-05A runs.
- PH-04 route registry and response shapes remain the source of truth:
  - `apps/api/src/http/**`
  - `apps/api/src/routes/**`
  - `apps/api/src/openapi/contractRegistry.ts`
  - `docs/spec/ph-04-verdict.md`

## Non-Goals

- No G03 or G05 feature implementation.
- No advanced visual workflow graph editor unless the minimum YAML-backed surface is already stable.
- No production SSO/session implementation beyond the local authenticated-shell fixture needed for PH-05 tests.
- No direct database access from UI code.
- No hardcoded localhost URL in production paths.

## Subphase Breakdown

| Subphase | Gate | Purpose | Main Outputs |
|---|---|---|---|
| PH-05A | auto | Web app scaffold and API client | `apps/web`, React/TypeScript/Vite foundation, API client, fixture adapter, build/test scripts |
| PH-05B | auto | HRMS shell and workspaces | layout, navigation, route guard, workspace switcher, loading/empty/error/no-permission states |
| PH-05C | auto | P01 workflow operations UI | inbox, task detail, action panel, comments, send-back/delegate/cancel/query, YAML-backed config validate/review/publish/simulate |
| PH-05D | auto | G01/G12/G13 foundation views | employee profile, masked PII display, SR timeline, document attachments/legal-hold/retention views |
| PH-05E | human after GREEN | UI conformance and review packet | end-to-end UI conformance tests, accessibility/static checks, PH-05 verdict and demo-freeze evidence |

PH-05E remains human-gated because UI acceptance and workspace information architecture are judgment-bearing before PH-06 builds module-specific flows on top of them.

## Implementation Requirements

- Use React + TypeScript. Tailwind/shadcn conventions may be implemented through local utility components if dependencies are not yet installed, but the component model must remain compatible with shadcn-style primitives.
- Build the actual application surface as the first screen. Do not create a landing page.
- Use real PH-04 route names and response shapes through a typed API client. Fixture mode is allowed only when explicitly labelled and backed by the PH-04 contract snapshot.
- Keep UI dense, operational, and government-HRMS appropriate: no marketing hero, no decorative card stacks, no oversized editorial layout.
- Include mobile and desktop responsive states for shell, inbox, task detail, records, and configuration review.
- No skeleton UI components. Every primary screen must have loading, empty, error, no-permission, and partial-data behavior.

## Minimum UI Surface

Shell:
- Authenticated layout.
- Workspace switcher: Me, My Team, Admin.
- Primary nav: Inbox, Employees, Service Register, Documents, Workflow Config.
- Route guard and no-permission view.

Workflow:
- P01 inbox from `/api/v1/workflow/tasks`.
- Task detail from workflow instance/task data.
- Action panel for approve, reject, send-back, delegate, cancel, query, and advance where applicable.
- Comments and mandatory reason validation for send-back/reject/cancel.
- Audit/history panel using available PH-04 evidence or fixture adapter.

Workflow configuration:
- YAML-backed workflow config editor/review surface.
- Validate, simulate, submit for review, publish, and export evidence commands.
- Maker-checker status model; no direct publish from maker-only role.
- Advanced PUDA visual config UI remains deferred unless safely ported without PUDA domain leakage.

Foundation records:
- G01 employee list/detail/profile-360 with P02 masked PII states.
- G12 SR timeline with append-only/hash-chain visual cues.
- G13 document list/detail/attachment, versions, legal hold, and retention fail-closed views.

## Test Plan

- Web typecheck/build tests through `npm run web:check`.
- Node UI contract tests for API-client route usage and fixture parity.
- Component behavior tests for workspace switcher, route guards, task actions, mandatory reason validation, PII masking labels, SR timeline, document legal hold, and workflow config state transitions.
- Static hygiene scans: no `any`, no `as any`, no production `console.log`, no hardcoded localhost URL in production paths.
- PH-05E conformance test maps the minimum UI surface to files and test evidence.

## Rollback and Quarantine

- Rollback: disable route entries per feature area while keeping the shell and API client intact.
- Retry: keep P01 inbox/task UI as the minimal path; defer workflow config visual editing if unstable.
- Quarantine: G01/G12/G13 read views can be completed independently; failure in workflow config UI must not block inbox/task operations.

## Human Gate

PH-05E parks after GREEN for review of:
- Workspace IA and route naming.
- Mobile/desktop fit of key screens.
- Workflow config maker-checker UX.
- Fixture-mode caveats and deferred visual editor scope.

## Check-Authoring Gap

- PH-05A-D have executable shell oracles and use `gate: auto`.
- PH-05E has an executable oracle but uses `gate: human` for UI acceptance judgment before PH-06.
