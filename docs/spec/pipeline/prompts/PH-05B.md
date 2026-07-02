/goal
  objective: Rebuild the HRMS SHELL, WORKSPACES, AND ROUTE GUARDS as a real gated application surface.
    The audit (docs/reviews/brd-coverage-audit-20260702.md) found navigation exposes only 5 items for 14
    modules, there is no login state, and App.tsx hardcodes permissions={["*"]} so the RouteGuard never
    denies anything. Deliver navigation to all 14 module workspaces, a guard that actually gates render
    from session-derived permissions, and real login/denied states. The re-baselined oracle asserts this
    and must go GREEN.
  context:
    - docs/reviews/brd-coverage-audit-20260702.md
    - apps/web/src/app/**                              # AppShell, navigation, RouteGuard, WorkspaceSwitcher, OperationalStates
    - apps/web/src/App.tsx , apps/web/src/modules/**   # the 14 module workspaces to reach
    - docs/brd/v3/*.md                                 # module names/surfaces G01..G14
    - apps/web/test/ph05-shell.test.cjs
    - docs/spec/pipeline/checks/ph-05b.sh              # the oracle — read it, satisfy it, never edit it
  audit_gaps:                                          # each gap below is asserted by the oracle
    - navigation.ts lists inbox/employees/service-register/documents/workflow-config only; G02–G11 and
      G14 workspaces are unreachable. Add a nav entry per module: employees (G01), personal-details (G02),
      attendance/leave (G03), leave-sr relay (G04), transfers (G05), promotions (G06), training (G07),
      apar (G08), disciplinary (G09), payroll (G10), pension (G11), service-register (G12),
      documents (G13), analytics (G14).
    - App.tsx passes permissions={["*"]} — the guard is decorative. Permissions must come from a session
      source (login/token), and every module workspace must render behind a RouteGuard with its own
      requiredPermission.
    - There is no login state: an unauthenticated user must see a login/sign-in surface, and a user
      lacking a workspace permission must see the no-permission state instead of the workspace.
  constraints:
    - RouteGuard remains the single gating point (canAccess + no-permission render); do not fork a second
      guard mechanism. Each of the 14 workspaces declares a distinct requiredPermission aligned with the
      API permission families (g01..g14 prefixes).
    - Session/identity comes from the PH-05A client/session provider; never hardcode a wildcard grant or
      a literal token in src. Secrets via env only.
    - Keep WCAG basics intact: nav is keyboard-reachable, states use the existing OperationalState kinds.
    - No console.log, no hardcoded localhost, no TypeScript any in apps/web/src.
    - Do NOT edit docs/spec/pipeline/checks/** or prompts/** — do not weaken the oracle.
    - Do NOT create or modify anything under .state/ or approvals/.
    - Surgical scope: app shell/nav/guard/session + tests. Inbox forms are PH-05C; record views PH-05D.
  work_loops:
    - name: full navigation + per-workspace guards
      max_iterations: 5
      repeat_until: navigation.ts models one entry per module (all 14), the switcher/shell reaches each
        workspace, and every workspace render sits behind RouteGuard with a distinct requiredPermission
        (>=14 guarded surfaces outside tests).
      steps: [extend navigation model, route each workspace, wrap each in RouteGuard with its permission]
    - name: session-driven permissions + login/denied states
      max_iterations: 5
      repeat_until: permissions derive from a session object (no permissions={["*"]} literal outside
        tests), an unauthenticated visitor gets a login/sign-in state, and a user without a workspace
        permission gets the no-permission state for that workspace only.
      steps: [introduce session context from the client provider, add login surface, thread permissions,
        verify denial renders per-workspace]
    - name: verify against the oracle
      max_iterations: 4
      repeat_until: ph05-shell.test.cjs asserts denied rendering for a missing permission and the login
        state for no session; `npm run -s typecheck`, `npm test`, `npm run -s web:typecheck`, and
        `npm run -s web:test` all pass; `bash docs/spec/pipeline/checks/ph-05b.sh` prints GREEN.
      steps: [write shell behaviour tests, run all four toolchain commands, run the oracle, fix, repeat]
  evidence_required:
    - apps/web/src/app/** and App.tsx diffs (navigation model, guard wiring, session source, login state)
    - apps/web/test/ph05-shell.test.cjs with passing web:test output
    - GREEN output of `bash docs/spec/pipeline/checks/ph-05b.sh` captured in the phase log
  escalate_when:
    - The permission naming for a module cannot be derived from the API permission families without
      guessing (name the module; request the mapping).
    - A real login flow needs an auth endpoint that PH-04 does not expose — implement the session
      boundary against the provider interface and record the caveat; do not invent server endpoints.
    - The oracle stays RED after the loop budget for reasons outside the app shell scope.
