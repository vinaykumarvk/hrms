/goal
  objective: Complete PH-05B - implement the HRMS shell, workspace switcher, navigation, route guard, and operational UI states.
  context:
    - docs/spec/ph-05-ui-implementation-plan.md
    - apps/web/src/**
    - apps/web/test/**
    - docs/spec/ph-04-verdict.md
  constraints:
    - Do not build module-specific G03/G05 flows.
    - No skeleton UI components; real loading, empty, error, no-permission, and partial-data states are required.
    - No marketing/landing page.
    - Keep text fitting on mobile and desktop.
    - Do not use `any`, `as any`, production `console.log`, or hardcoded localhost URLs.
  freedom:
    - Define local layout, navigation, and route primitives.
    - Add focused tests for shell behavior and permissions.
  work_loops:
    - name: Shell and workspace
      max_iterations: 4
      repeat_until: The first app screen is an authenticated HRMS shell with Me, My Team, and Admin workspaces.
      steps:
        - build layout and workspace switcher
        - build primary nav
        - wire route state
        - add mobile/desktop responsive structure
    - name: Guard and states
      max_iterations: 4
      repeat_until: Route guard and standard operational states are implemented and covered by tests.
      steps:
        - add permission model
        - add no-permission state
        - add loading/empty/error/partial-data states
        - test state rendering
    - name: Review-repair
      max_iterations: 3
      repeat_until: PH-05B oracle is GREEN and manifest evidence is recorded.
      steps:
        - run npm run web:check
        - run bash docs/spec/pipeline/checks/ph-05b.sh
        - fix gaps
  evidence_required:
    - apps/web/src/app/AppShell.tsx
    - apps/web/src/app/WorkspaceSwitcher.tsx
    - apps/web/src/app/navigation.ts
    - apps/web/src/app/RouteGuard.tsx
    - apps/web/src/app/OperationalStates.tsx
    - apps/web/test/ph05-shell.test.cjs
    - docs/spec/manifest.json records PH-05B
    - `bash docs/spec/pipeline/checks/ph-05b.sh` GREEN
  escalate_when:
    - A user-visible verb maps to multiple equally plausible UI surfaces.
    - The shell requires auth/RBAC policy changes.
    - Exit criteria cannot be made truthful.
