# HRMS UI/UX Review — Full Repository — 2026-07-11

## 1. Scope and Preflight

- Path: **light**, report-only review of the sole UI app, `apps/web`.
- Branch / commit: `feature/dev` / `82fb4710d8417fcbc220c7894d1504325cb9f299`.
- Framework: React 19 + TypeScript + Vite. Styling is one custom CSS file; Tailwind and shadcn are not installed and are therefore not adoption requirements.
- Requirements sources: `docs/spec/ph-05-ui-implementation-plan.md`, `docs/spec/ph-05-verdict.md`, and the repository AGENTS instructions.
- Existing modified/untracked files were treated as user-owned. This report is the only review-created file.
- Environment: production build works. TypeScript is a broken symlink to `../workflow-platform`; tests that `require("typescript")` cannot run. No browser automation or accessibility scanner is installed. The backend and authenticated browser fixture were not started.

### Commands and artifacts

| Command / artifact | Result |
|---|---|
| `npm run web:check` | **FAIL** at typecheck: configured TypeScript package is unavailable |
| `npm run web:build` | **PASS**; JS 337.42 kB / 91.28 kB gzip, CSS 9.70 kB / 2.63 kB gzip |
| `npm run web:test` | **FAIL**; 55 pass, 19 fail, all observed failures caused by missing `typescript` |
| `bash docs/spec/pipeline/checks/ph-05e.sh` | **FAIL**; UI source checks pass, four build/test gates RED |
| Static source audits (`rg`) | **Executed**; 49 TSX files, 49 buttons, 79 form controls, 0 focus-visible rules, 91 raw color occurrences, 4 `100vh`, 0 i18n references, 0 error boundaries, 0 reduced-motion rules, 0 theme mechanism, 0 skeleton components |
| 360×800 / 768×1024 / 1280×800 screenshots | **Not executed**; no browser harness available |
| Light/dark snapshots | **Not executed**; no theme or dark mode exists |
| Keyboard-only traversal | **Not executed** in browser; static semantics inspected |
| Automated accessibility scan | **Not executed**; no scanner/browser dependency available |

Manual artifact procedure: restore the TypeScript dependency, run the app and API, authenticate with a seeded user, capture login and shell at the three required widths, tab through login → workspace switcher → navigation → workflow action, and run axe on both login and the shell.

## 2. UI Inventory

The application is not route-based. `App.tsx:78-155` mounts all authorized surfaces into one long page. Navigation uses hash links (`navigation.ts:26-42`) to a minority of matching element IDs.

| App | Route / anchor | Screen ownership | CSS | Shared components | i18n | Theme |
|---|---|---|---|---|---|---|
| web | unauthenticated root | `LoginPanel` | `styles.css:18-135` | none | hardcoded English | light only |
| web | `#inbox`, `#workflow-config` | workflow inbox/detail/actions/config | `styles.css:228-365` | `OperationalState` | hardcoded English | light only |
| web | `#employees` | G01 profile/privacy/contacts/dependents | generic record styles | `RouteGuard`, `OperationalState` | hardcoded English | light only |
| web | intended G02-G14 anchors | 14 module workspaces and consoles | mostly generic record/grid styles | same | hardcoded English | light only |

### Navigation inventory

| Sidebar | Mobile collapse | Hamburger | Icons | Active state | 44px targets |
|---|---|---|---|---|---|
| Present (`AppShell.tsx:43-52`) | No; becomes an inline 16-item grid (`styles.css:485-506`) | Missing | Missing | Missing | Not guaranteed (`styles.css:177-186`) |

### State and substance inventory

| Area | Empty | Loading | Error boundary | 404 | Substance |
|---|---|---|---|---|---|
| 14 summary workspaces | text state present | text state present | missing | N/A (no router) | functional data rendering |
| workflow inbox | present | present | missing | N/A | functional |
| mutation consoles/forms | inline status generally present | button text generally present | missing | N/A | functional; API methods and payloads present |
| shell | five demonstration state cards always rendered | N/A | missing | missing | navigation/workspace behavior is partial |

No mutation/query component met the P0 skeleton definition: representative forms contain controlled fields and call client methods, e.g. leave submission at `LeaveApplyForm.tsx:90-119,132-200`, payroll at `PayrollRunConsole.tsx:164-220`, and pension at `PensionCaseConsole.tsx:191-340`. However, the always-visible `StandardOperationalStates` gallery (`AppShell.tsx:53-57`, `OperationalStates.tsx:19-28`) is demo scaffolding shown to end users.

Faceted filters are not an established pattern in this project; no facet endpoint/helper was found. Locale matrix: English-only HTML language declaration; no locale configuration or locale files exist.

## 3. Login Screen Completeness Audit

| Group | Present | Partial | Missing | Key evidence |
|---|---:|---:|---:|---|
| Layout L-01..08 | 4 | 2 | 2 | branding and constrained card exist; `100vh`, no token system/footer/version |
| Form F-01..09 | 6 | 1 | 2 | native form/autocomplete/toggle exist; no maxLength; no field-linked validation |
| Auth A-01..09 | 3 | 2 | 4 | remember-me works; no async loading/session-expiry/intended redirect; forgot-password is only a notice |
| Theme T-01..05 | 0 | 0 | 5 | no theme mechanism |
| Accessibility X-01..08 | 3 | 2 | 3 | landmark/labels/alert exist; zero focus-visible rules; 16px checkbox target; no field error linkage |
| Responsive R-01..04 | 1 | 2 | 1 | breakpoints exist but were not browser verified; uses `100vh` |

Overall: **FAIL**. Positive evidence: branded split layout (`LoginPanel.tsx:37-63`), native form and autocomplete (`:68-82`), password toggle (`:82`), username-only persistence (`:17-33,85-88`), and alert semantics (`:90-91`). Blocking gaps: no submit loading/double-submit state (`:25-34,93`), no real in-page reset form (`:77,91`), no theme selector, no focus-visible styling, `100vh` (`styles.css:22,127`), hardcoded colors, and no i18n.

## 4. Mobile Navigation Audit

NAV-01/02 **FAIL**: the sidebar is never hidden and has no hamburger. NAV-03..10 are consequently missing. NAV-11 is **PARTIAL**: the aside has an accessible label but the nested `<nav>` does not (`AppShell.tsx:44-45`). All 16 menu items are text-only anchors (`:46-50`) with no active state, icons, or verified 44px targets. On narrow screens the full menu expands into a multi-row grid before every module (`styles.css:491-502`), creating substantial navigation overhead.

## 5. Design System Findings

The project uses ad-hoc custom CSS, not Tailwind/shadcn. It has no declared design tokens: 91 raw color/gradient occurrences and many literal radii/spacing values are concentrated in `styles.css:1-507`. The login and shell share this global file rather than a dedicated login stylesheet. State coverage is incomplete: the static audit found zero `:focus-visible`, no global disabled styling, and many generic raw controls. Module forms such as `LeaveApplyForm.tsx:132-200` have no matching form layout/control selectors beyond `button,input { font: inherit; }` (`styles.css:13-16`).

## 6. Tailwind/shadcn Component Adoption Findings

**N/A.** No `tailwind.config.*`, `components.json`, Tailwind directives, or `components/ui` imports exist. The PH-05 plan permits local primitives, so framework migration is not recommended. The relevant failure is the absence of an equivalent shared accessible component set.

## 7. Responsive & Mobile-First Findings

1. **P0 / High / Confirmed / risk 20** — No mobile navigation disclosure pattern. **Where:** `AppShell.tsx:43-52`, `styles.css:485-506`. **Impact:** 16 links consume the top of every mobile page. **Fix:** add hamburger, off-canvas nav, backdrop, Escape, focus return/trap, and scroll lock. **Verify:** 320/360px keyboard and touch test.
2. **P1 / High / Confirmed / risk 15** — Full-height layouts use `100vh`, including login and shell (`styles.css:22,127,143,197`). **Impact:** mobile browser chrome can hide content. **Fix:** use `100dvh` with safe fallback. **Verify:** iOS Safari orientation/keyboard test.
3. **P1 / High / Partially Confirmed / risk 12** — Data tables have semantic headers but no responsive wrapper/card reflow (`AnalyticsWorkspace.tsx:271-307,314-335`; no table CSS exists). **Impact:** five-column tables likely overflow at 320px. **Fix:** responsive record cards or controlled overflow for true matrices. **Verify:** screenshot at 320px with long values.
4. **P2 / High / Confirmed / risk 8** — CSS is desktop-first with max-width pixel breakpoints (`styles.css:124,131,485`). **Fix:** establish mobile base rules and tokenized `min-width` enhancements. **Verify:** breakpoint audit and viewport matrix.
5. **P2 / Medium / Confirmed / risk 6** — No safe-area inset handling on navigation/header. **Verify:** notched-device emulation.

## 8. Accessibility Findings

6. **P1 / High / Confirmed / risk 15** — Zero `:focus-visible` rules across 49 buttons and 79 inputs. **Where:** `styles.css`; interactive examples `AppShell.tsx:35-37`, `LoginPanel.tsx:77-93`. **Impact:** keyboard users cannot reliably locate focus. **Fix:** shared tokenized focus ring on every interactive primitive. **Verify:** keyboard traversal plus axe.
7. **P1 / High / Confirmed / risk 12** — Small targets: nav/tab padding is only 8px vertical (`styles.css:177-186`), login checkbox is 16×16 (`:112-114`), and link buttons have 3px padding (`:106`). **Fix:** minimum 44×44 hit areas. **Verify:** computed-size audit.
8. **P1 / High / Confirmed / risk 12** — No error boundary wraps React (`main.tsx:12-16`). **Impact:** render failures can white-screen the whole HRMS. **Fix:** accessible boundary with retry/home actions and telemetry. **Verify:** throw a test error.
9. **P1 / High / Confirmed / risk 12** — No reduced-motion support; login hover transforms and transitions remain active (`styles.css:107-119`). **Fix:** add `prefers-reduced-motion: reduce`. **Verify:** emulated media feature.
10. **P1 / Medium / Confirmed / risk 9** — Workspace switcher uses ARIA tabs but omits tab keyboard behavior and controlled panels (`WorkspaceSwitcher.tsx:10-23`); changing workspace only changes a label (`AppShell.tsx:16-21,53-55`). **Fix:** either implement the tabs pattern fully or use ordinary buttons/select controlling visible content. **Verify:** Arrow/Home/End or button behavior test.
11. **P1 / High / Confirmed / risk 12** — Login password toggle lacks an accessible state-specific label; visible text is its only name (`LoginPanel.tsx:82`). **Fix:** `aria-label` and `aria-pressed`; preserve a 44px target. **Verify:** screen-reader name/state inspection.
12. **P2 / Medium / Confirmed / risk 8** — Login rejection is not associated to either input and `aria-invalid` is absent (`LoginPanel.tsx:69-90`). **Fix:** set `aria-invalid` and `aria-describedby`, clear error on edit. **Verify:** accessibility tree.
13. **P2 / Medium / Confirmed / risk 6** — Color contrast is unverified and the CSS relies extensively on literal muted colors (`styles.css:64,83,96,102,111,114,122,162-169`). **Fix:** token palette with measured AA pairs. **Verify:** automated contrast audit in both themes.

## 9. Interaction & State Findings

14. **P0 / High / Confirmed / risk 20** — Most navigation hashes have no matching target IDs. Navigation declares 16 destinations (`navigation.ts:26-42`), while `App.tsx:86-154` sections lack those IDs; only a few child screens define IDs. **Impact:** many navigation actions visibly do nothing. **Fix:** introduce real routes or stable section IDs with focus/scroll management. **Verify:** click every nav item and assert URL + destination heading.
15. **P1 / High / Confirmed / risk 15** — Workspace switching does not filter or change surface content (`AppShell.tsx:16-21,53-56`). **Impact:** “Me/My Team/Admin” promises distinct scopes but displays the same page. **Fix:** bind workspace to routes/query scope and permission-aware content. **Verify:** per-workspace content assertions.
16. **P1 / High / Confirmed / risk 12** — Login submission is synchronous with no loading/double-submit protection (`LoginPanel.tsx:25-34,93`). **Fix:** async authentication state, disabled button, spinner/text, and error clearing. **Verify:** delayed auth test and rapid double-click.
17. **P1 / High / Confirmed / risk 12** — Forgot-password is not a flow; it only shows static advice (`LoginPanel.tsx:77,91`). **Fix:** in-page reset panel with required identifier, back action, success/error state, and real supported API behavior. **Verify:** full keyboard flow.
18. **P1 / High / Confirmed / risk 12** — Workflow config “validate” and “simulate” buttons discard their return values, and “evidence export” has no handler (`WorkflowConfigConsole.tsx:34-48`). **Impact:** controls appear operative without causing visible/actionable outcomes. **Fix:** wire explicit result state/export or remove controls until supported. **Verify:** interaction tests for each verb.
19. **P1 / High / Confirmed / risk 12** — `StandardOperationalStates` permanently shows loading/error/no-permission cards after real content (`AppShell.tsx:53-57`). **Impact:** users see false system status and may believe the page is failing. **Fix:** remove demo gallery from production composition; render states only from real state machines. **Verify:** ready-state screenshot contains no false alerts.
20. **P1 / Medium / Confirmed / risk 9** — Error states expose raw internal error codes broadly (e.g. `TaskActionPanel.tsx:83-86`, `LeaveApplyForm.tsx:202-205`). **Fix:** user-safe messages with correlation/reference ID and logged detail. **Verify:** forced 500/403 cases.

## 10. Empty State / Error Boundary / Loading Pattern Findings

The 14 canonical summary workspaces and inbox have textual loading/error/empty branches, confirmed by the PH-05E source oracle. Empty states lack the skill’s recommended icon, explanation, and CTA (`OperationalStates.tsx:22-26`). No skeleton/shimmer exists, so data-heavy cards/tables can shift. No global retry boundary, route fallback, offline state, or loading timeout is implemented. The absence of a router makes a 404 page structurally unavailable.

## 11. Modern UI Pattern Findings

21. **P1 / High / Confirmed / risk 12** — No shared component library/primitives despite dozens of raw buttons/inputs and complex workflows. **Fix:** create local Button/Input/Select/Field/Alert/Card/Table/Dialog primitives compatible with project policy. **Verify:** component tests and usage coverage.
22. **P1 / Medium / Confirmed / risk 10** — Mutation feedback uses scattered inline paragraphs rather than a consistent live notification pattern (e.g. `PayrollRunConsole.tsx:198-228`). **Fix:** shared inline Alert/Status and optional queued toast with live region. **Verify:** mutation success/failure screen-reader test.
23. **P1 / High / Confirmed / risk 12** — No confirmation dialog pattern was found for sensitive payroll/workflow actions (`PayrollRunConsole.tsx:251-275`, `TaskActionPanel.tsx:43-90`). **Fix:** contextual confirmation for irreversible/finalizing actions, with focus trap/return. **Verify:** keyboard dialog tests and cancellation test.
24. **P2 / High / Confirmed / risk 8** — No dark mode/theme system; root and every major surface hardcode light colors (`styles.css:1-3,18-30,98-122,142-239`). **Fix:** CSS variables plus pre-paint theme application and login selector. **Verify:** light/dark snapshots and contrast scan.
25. **P2 / High / Confirmed / risk 8** — No i18n layer; all UI text is embedded English and no locale files exist. **Fix:** extract stable keys, start with login/navigation/errors, and declare supported locales. **Verify:** missing-key check and long-string visual test.
26. **P2 / Medium / Confirmed / risk 6** — Loading uses text only, no layout-matching skeleton (`OperationalStates.tsx:9-15`). **Fix:** shared card/table skeleton with reduced-motion handling. **Verify:** throttled-network CLS measurement.
27. **P2 / Medium / Confirmed / risk 6** — Search/filter UX is essentially absent despite the single-page inventory scale; users must scroll all mounted modules. **Fix:** routing plus scoped list search/filter where requirements call for it. **Verify:** navigation task timing and URL persistence.

## 12. QA Gates and Verdict

| Blocking gate | Result | Basis |
|---|---|---|
| Accessibility | FAIL | focus, motion, target, boundary and contrast gaps |
| Mobile responsiveness | FAIL | unverified overflow, `100vh`, table risk |
| Mobile navigation | FAIL | no collapse/hamburger/icons |
| Login completeness | FAIL | missing loading/reset/theme/accessibility features |
| Interaction predictability | FAIL | dead hashes and non-operative config controls |
| Sensitive action safety | FAIL | no confirmation pattern |
| System status visibility | PARTIAL | canonical states exist; false gallery and no skeleton/timeout |
| Error prevention/recovery | PARTIAL | validation exists; no boundary/retry/offline |
| Progressive disclosure | FAIL | all authorized modules mounted at once |
| State resilience | PARTIAL | local states exist; route/workspace state does not |
| Graceful degradation/offline | FAIL | no offline UX |
| Empty state coverage | PARTIAL | text states present but limited guidance/CTA |
| Error boundary coverage | FAIL | absent |
| UI determinism | PARTIAL | client state is deterministic; broken anchors/control no-ops |
| Behavioral trust | FAIL | workspace/nav labels overpromise behavior |
| Component substance | PASS | no skeleton/stub form found; real fields and mutations exist |

Non-blocking: perceived performance **PARTIAL**; temporal awareness **PARTIAL**; input efficiency **PARTIAL**; UX observability **FAIL**; motion quality **FAIL**; dark mode **FAIL**; design-system adoption **FAIL**.

```text
WCAG Status:            FAIL
Mobile Readiness:       FAIL
Mobile Navigation:      FAIL
Login Completeness:     FAIL
Empty/Error States:     PARTIAL
Component Substance:    PASS
Blocking Gates:         1/16 PASS, 4/16 PARTIAL, 11/16 FAIL
Design-System Adoption: FAIL
Non-Blocking Gates:     0/7 PASS, 3/7 PARTIAL, 4/7 FAIL
Release Decision:       NO-GO
```

Blocking failures: navigation and workspace behavior, mobile navigation, WCAG fundamentals, incomplete login, absence of error boundary/offline recovery, sensitive-action confirmation, and progressive disclosure. The failing verification environment is an additional release-evidence blocker.

## 13. Bugs and Foot-Guns

- Hash destinations do not consistently exist, so navigation silently fails.
- False operational-state examples ship in the production shell.
- Validate/simulate/export controls appear actionable but do not update or export.
- `aria-invalid={fieldError !== null || undefined}` in `TaskActionPanel.tsx:61` is an odd boolean expression; replace with the direct boolean and ensure the described element is strictly the active error/help text.
- Disabled controls rely on native rendering and often give no visible reason beyond a `title` tooltip (`PayrollRunConsole.tsx:256-267`).
- The TypeScript file dependency makes verification dependent on a sibling repository and is currently broken.

## 14. BRD UI Compliance Matrix

| BRD / plan obligation | Evidence | Status | Gap / next step |
|---|---|---|---|
| Authenticated layout | `App.tsx:52-79`, `LoginPanel.tsx` | PARTIAL | production auth UX/loading/session expiry incomplete |
| Me/My Team/Admin switcher | `AppShell.tsx:16-21,30,54` | FAIL | changes label only; bind scope/content |
| Primary navigation | `navigation.ts:26-42`, `AppShell.tsx:43-52` | FAIL | broken targets, no mobile pattern |
| Loading/empty/error/no-permission/partial | module state branches; `OperationalStates.tsx` | PARTIAL | false demo gallery, weak CTAs, no global recovery |
| P01 inbox and task actions | `WorkflowWorkspace.tsx`, `TaskActionPanel.tsx` | PARTIAL | operational but safety/focus/feedback gaps |
| Workflow config review/publish/simulate/export | `WorkflowConfigConsole.tsx:16-52` | FAIL | three controls are no-op or not visible-result actions |
| G01/G12/G13 foundation views | `App.tsx:140-153` | PARTIAL | present, mounted in undifferentiated long page |
| Responsive shell/inbox/detail/records/config | `styles.css:485-506` | FAIL | minimal single breakpoint, no mobile nav/table strategy |
| No skeleton UI components | 49 TSX static scan | PASS | forms and views have substantive content |
| Accessibility/static checks | PH-05E oracle | FAIL | source oracle checks pass but required commands RED; WCAG scan missing |
| PII masking/governance cues | `EmployeeProfile.tsx`, analytics suppression UI | PARTIAL | source evidence present; browser verification absent |
| Human UI/demo freeze | `docs/spec/ph-05-verdict.md` | FAIL | current review finds blocking UI failures |

## 15. UI Architect Backlog

| ID | Title | Priority | Risk | Effort | Where | Change / verify | Dependencies |
|---|---|---:|---:|---:|---|---|---|
| UI-01 | Repair nav destinations/routes | P0 | 20 | M | App/navigation | real routes or matching IDs; click-all test | IA decision |
| UI-02 | Mobile off-canvas navigation | P0 | 20 | M | AppShell/styles | hamburger, overlay, focus/escape/scroll; 320px test | UI-01 |
| UI-03 | Make workspace switch meaningful | P1 | 15 | L | App/AppShell/client queries | scope visible content; role tests | product scope |
| UI-04 | Add focus-visible system | P1 | 15 | S | styles/shared primitives | keyboard and axe | none |
| UI-05 | Add React error boundary | P1 | 12 | S | main/app | retry/home UX; forced-error test | logging policy |
| UI-06 | Complete async login states | P1 | 12 | M | LoginPanel/session | loading, disable, error clearing, redirects | auth contract |
| UI-07 | Build supported password-reset panel | P1 | 12 | M | LoginPanel/API | in-page flow; E2E | auth API |
| UI-08 | Wire workflow config controls | P1 | 12 | M | WorkflowConfigConsole | visible results/export; tests | config API |
| UI-09 | Remove operational-state demo gallery | P1 | 12 | S | AppShell | only real state shown; screenshot | none |
| UI-10 | Add sensitive-action dialog | P1 | 12 | M | payroll/workflow | accessible confirmation; keyboard test | primitive set |
| UI-11 | Establish local UI primitives | P1 | 12 | L | app/components | Button/Field/Alert/Card/Table/Dialog | design tokens |
| UI-12 | Guarantee 44px targets | P1 | 12 | M | styles/all controls | computed-size audit | UI-11 |
| UI-13 | Responsive table pattern | P1 | 12 | M | analytics/list views | cards/wrapper; 320px test | UI-11 |
| UI-14 | Add reduced-motion mode | P1 | 12 | S | styles | emulation test | tokens |
| UI-15 | User-safe error messaging | P1 | 9 | M | forms/states | reference IDs, no raw internals; forced errors | error taxonomy |
| UI-16 | Repair TypeScript dependency | P1 | 15 | S | package/tooling | clean install + web:check | dependency policy |
| UI-17 | Add browser/a11y E2E harness | P1 | 12 | M | tests | viewport matrix + axe | UI-16 |
| UI-18 | Tokenize colors/spacing/radius | P2 | 8 | L | styles | token lint; visual regression | design approval |
| UI-19 | Theme/dark mode | P2 | 8 | L | styles/main/login | prepaint theme; snapshots | UI-18 |
| UI-20 | Extract i18n content | P2 | 8 | L | all TSX | locale key parity test | locale policy |
| UI-21 | Improve empty-state CTAs | P2 | 8 | M | OperationalState/modules | first-run/filter variants; tests | product actions |
| UI-22 | Add skeletons/timeouts | P2 | 6 | M | data views | throttled network/CLS | UI-11 |
| UI-23 | Consistent live notifications | P2 | 6 | M | mutation forms | Alert/toast queue; SR test | UI-11 |
| UI-24 | Add session-expiry UX | P2 | 8 | M | client/session/login | intended redirect + message | auth contract |
| UI-25 | Add active navigation/focus transfer | P2 | 8 | M | shell/router | current route + heading focus | UI-01 |
| UI-26 | Add safe-area support | P2 | 6 | S | styles | notched-device test | UI-02 |
| UI-27 | Add search/progressive disclosure | P2 | 8 | L | routes/list views | task timing and URL state | UI-01 |
| UI-28 | Contrast certification | P2 | 8 | M | token palette | automated AA report | UI-18/19 |

## 16. Quick Wins and Stabilization

### Under two hours each

1. Replace four `100vh` uses with `100dvh` plus fallback; verify mobile browser emulation.
2. Add shared `:focus-visible` rules; keyboard-test login, tabs, nav, inbox, and action panel.
3. Remove `StandardOperationalStates` from `AppShell`; verify clean ready-state DOM.
4. Add `prefers-reduced-motion`; verify emulation disables transforms/transitions.
5. Add 44px minimums to nav, tabs, checkbox label, and login link buttons; inspect computed sizes.
6. Add state-specific accessible labeling to password visibility control.
7. Repair the TypeScript symlink/dependency and rerun `npm run web:check`.

### Two-day stabilization

1. Implement routing/valid destinations and active navigation.
2. Add accessible mobile drawer navigation.
3. Add error boundary and user-safe retry states.
4. Complete login async state and password-reset panel.
5. Wire or remove workflow config no-op controls.
6. Introduce the first local primitives: Button, Field, Alert, Dialog, responsive Table.
7. Add confirmation flows around finalizing payroll/workflow actions.
8. Add Playwright viewport + keyboard + axe smoke tests.
9. Capture the mandatory screenshot/theme matrix (theme matrix remains blocked until theme support exists).

## 17. Top 5 Priorities

1. Fix routing/navigation and make workspace selection truthful.
2. Deliver an accessible mobile navigation pattern.
3. Close WCAG fundamentals: focus, target size, reduced motion, error boundary, contrast evidence.
4. Complete login loading/reset/session UX.
5. Restore green verification and add browser-level responsive/accessibility evidence.

**Release verdict: NO-GO.** Functional module substance is stronger than the shell suggests, but the shell/navigation contract, mobile behavior, login completeness, accessibility foundation, and verification evidence are not release-ready.

## 18. Council Amendment — 2026-07-11

The five-advisor adversarial council evaluated every finding and backlog row. Its full analysis is recorded in `doc/evaluations/hrms-ui-remediation-council-report-20260711.md`.

The council confirms the **NO-GO** verdict but changes how the backlog is interpreted:

- The 27 findings and 28 backlog rows are overlapping evidence, not 55 independent requirements.
- Every item remains traceable through a finding-disposition ledger; each must be fixed, merged, deferred with authority/owner/date, or rejected with evidence.
- Release readiness is achieved by passing all 16 blocking gates with deterministic role, viewport, keyboard, accessibility, and authorization-negative evidence—not by backlog completion percentage.
- Tooling restoration, seeded Employee/Manager/Admin personas, three critical journeys, and route/workspace/auth/action contract freezes are entry gates.
- The Tailwind/shadcn versus local-primitives conflict is a formal architecture/dependency decision. No production dependency is introduced from review authority alone.
- If Tailwind/shadcn is approved, adopt it as an early foundation but migrate incrementally by vertical slice. If architecture is amended for local primitives, those primitives must satisfy the same token/accessibility contracts.
- Dark mode, broad i18n, search, and skeleton polish remain tracked but block release only where signed architecture or requirements make them mandatory. Responsive behavior, contrast, recoverable loading, and safe feedback remain blocking.
- Workspace work requires server-enforced scope and cached/deep-link denial tests; UI-only routing must never imply authorization.
- Confirmation dialogs apply to actions classified as irreversible or finalizing, not every mutation.

The dependency-ordered implementation plan is maintained in `docs/spec/phased-plan.yaml` under `ui_remediation_2026_07_11`.
