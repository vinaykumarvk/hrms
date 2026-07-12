# Council Evaluation: HRMS UI Remediation Strategy

*2026-07-11 · Should all findings from `docs/reviews/ui-review-all-2026-07-11.md` be remediated as written, and how should that work be reshaped into a safe release plan?*

## Chairman's Verdict

### Recommendation

**Proceed with remediation, but do not execute the 27 findings and 28 backlog rows as independent requirements.** They overlap, and several recommendations need product, architecture, auth, or API decisions. Reframe the objective as: close every finding through an explicit disposition and make all 16 blocking UI gates pass with reproducible evidence.

The work must start with a conflict/evidence phase: restore deterministic TypeScript and browser verification; create a finding-to-proof ledger; define seeded Employee, Manager, and Admin personas including denied-access cases; freeze three critical journeys; and resolve the Tailwind/shadcn versus local-primitives conflict through an approved architecture decision. The governing architecture currently names Tailwind and shadcn, but PH-05 permits compatible local primitives and repository repair policy does not authorize adding production dependencies without amendment. No implementation plan may infer that authority.

After that gate, build shared accessible primitives incrementally, establish real permission-aware routing and workspace behavior, repair the responsive shell, and harden login plus sensitive workflow/payroll flows. Dark mode, broad i18n, skeleton polish, and search remain traceable but become release-blocking only where the architecture or accepted requirements say so.

### Where the Council Agrees

All five advisors independently concluded that the audit is not a specification and that findings/backlog rows must be consolidated into dependency-led work packages. All five put deterministic verification before behavioral changes. They also converged on the Tailwind/shadcn conflict as a prerequisite, not an implementation detail; on preserving existing substantive API-backed module forms; on freezing route, workspace, auth, and sensitive-action behavior rather than inventing it; and on prioritizing behavioral trust, authorization safety, mobile navigation, accessibility, and recovery before cosmetic breadth.

### Where the Council Clashes

The initial clash was whether `docs/architecture.md` immediately authorizes Tailwind/shadcn adoption. The Proponent initially favored direct adoption to avoid building a throwaway local system. The Contrarian and First-Principles views emphasized that architecture intent does not waive dependency/amendment controls and that a broad migration could destabilize functioning forms.

The targeted second pass resolved most of the clash. The council now agrees on an explicit architecture-resolution gate. If Tailwind/shadcn is confirmed and dependency changes are approved, it becomes an early, tested platform layer migrated by vertical slice. If the architecture is amended to allow local primitives, those primitives must implement the same token, accessibility, and component contracts. Framework-neutral component APIs, behavior tests, and tokens are a reversible bridge under either decision.

### Blind Spots Caught

- **Finding disappearance during consolidation:** three anonymous reviewers independently required a stable closure ledger mapping each original finding to disposition, role, viewport, theme, files, automated/manual proof, rollback trigger, and final status.
- **Deterministic test data:** the council initially discussed a green harness without specifying stable personas, permissions, workspaces, loading/error controls, and denial cases. These must be seeded alongside the harness.
- **Authorization negatives:** route/workspace tests must prove that cached, stale, or deep-linked content cannot cross workspace/role boundaries—not merely that permitted navigation renders.
- **Human usability evidence:** code and axe checks do not replace task-based validation with representative government-HRMS users and at least one keyboard/screen-reader user for the critical journeys.
- **Dependency authority:** adding routing, Tailwind, shadcn, i18n, or browser-test packages is a contract/dependency change and must follow the amendment workflow.

### Idea Evolution

The initial idea was “run and implement all findings.” Independent analysis changed this to “close all findings, implement only approved remediations, and pass the blocking gates.” Peer review added the closure ledger, deterministic role fixtures, and negative authorization matrix. The second pass changed immediate Tailwind/shadcn adoption into a formal decision followed by a reversible, incremental migration. The final plan therefore separates evidence and contract conflicts from component work, product/API prerequisites, UI slices, and release verification.

### Risk Register

| Risk | Severity | Source Advisor | Second pass | Mitigation |
|---|---|---|---|---|
| Findings disappear when duplicates are consolidated | High | Peer reviewers | N/A | Stable finding-to-proof ledger with fix/merge/defer/reject disposition |
| Tailwind/shadcn migration is unauthorized or becomes a big bang | High | Contrarian, First Principles | Yes | Architecture/dependency decision gate; narrow primitive proof slice |
| Local primitives create a second, throwaway design system | High | Proponent | Yes | Architecture authority resolved before broad primitive implementation |
| Workspace UI leaks or exposes stale cross-scope data | Critical | Contrarian | N/A | Server-enforced scope contract plus deep-link/cache denial tests |
| Review recommendations invent missing product/API behavior | High | Contrarian, Outsider, Executor | N/A | Freeze route/auth/reset/export/session/action contracts; quarantine unsupported items |
| “Green” UI evidence depends on mutable backend state | High | Peer reviewer | N/A | Seeded personas, fixtures, failure/loading controls, expected permissions |
| Tooling failures obscure regressions | High | All advisors | N/A | Restore clean-install typecheck/test/build/oracle baseline first |
| Broad visual migration regresses working domain surfaces | High | Contrarian, Executor | Yes | Vertical slices, old CSS retained temporarily, visual/behavior gates, feature flags |
| Backlog completion is mistaken for release readiness | High | Outsider, First Principles | N/A | Gate-based release criteria and evidence manifest |
| Dark mode/i18n/search expand the release without signed need | Medium | Contrarian, First Principles | N/A | Conditional requirements; defer with owner/date if not required |
| Sensitive confirmations are applied indiscriminately | Medium | Contrarian | N/A | Action classification; confirm only irreversible/finalizing operations |
| Automated checks miss real task usability | Medium | Outsider-style peer review | N/A | Moderated critical-journey validation before release gate |

### Finding Disposition Amendments

These dispositions supersede the original backlog's implied “implement everything now” reading. No item is dropped.

| Original backlog | Council disposition | Release treatment |
|---|---|---|
| UI-01, UI-25 | Merge: routed destinations, active state, focus transfer | Blocking fix after route contract freeze |
| UI-02, UI-26 | Merge: accessible mobile drawer plus safe areas | Blocking fix |
| UI-03 | Contract-gated workspace behavior and scope isolation | Blocking; do not implement from labels alone |
| UI-04, UI-12, UI-14 | Merge into accessibility primitive contract | Blocking fix |
| UI-05 | Global recovery boundary | Blocking fix |
| UI-06, UI-07, UI-24 | Merge into auth journey | Loading/error is blocking; reset/session behavior requires auth contract |
| UI-08 | Split by verb: wire supported operations; remove/quarantine unsupported controls | Blocking behavioral-trust fix |
| UI-09 | Remove false production states | Immediate blocking fix |
| UI-10 | Apply only to classified irreversible/finalizing actions | Blocking for those actions |
| UI-11, UI-18, UI-19, UI-28 | Architecture-gated design-system/theme/contrast program | Primitives/contrast blocking; dark theme conditional on architecture |
| UI-13 | Responsive table strategy based on data semantics | Blocking where 320/360px overflow is reproduced |
| UI-15 | Error taxonomy/UX contract | Blocking for unsafe/internal disclosure; contract-gated wording/reference ID |
| UI-16 | Deterministic toolchain | Entry gate |
| UI-17 | Browser/a11y harness with seeded personas | Entry/release-evidence gate |
| UI-20 | i18n extraction | Required if architecture/W.2 locale contract is confirmed; otherwise explicit defer |
| UI-21 | Contextual empty/retry actions | Blocking for critical journeys; remaining screens phased |
| UI-22 | Timeout/loading stability | Timeout/recovery blocking; skeleton visuals non-blocking polish |
| UI-23 | Shared live feedback | Blocking for critical mutations |
| UI-27 | Progressive disclosure follows routing; search only where accepted requirements demand it | Routing blocking; search conditional |

### The One Thing to Do First

Create and execute **UIR-00A: deterministic baseline restoration**—replace the broken sibling-linked TypeScript dependency through the approved dependency process, perform a clean install, and record `web:typecheck`, `web:build`, `web:test`, and PH-05E results before any UI behavior changes. In the same entry phase, create the finding closure ledger so every later change has a proof target.

## Advisor Responses

### Proponent

The remediation strategy is justified because the review identifies a coherent release-risk cluster, not unrelated cosmetic defects. Eleven of sixteen blocking gates fail, including dead navigation targets, ineffective workspace scoping, absent mobile disclosure, missing sensitive-action confirmations, and no error boundary. These directly undermine behavioral trust and operability in an HRMS handling payroll, workflow approvals, and employee data. The encouraging evidence is that the application is not hollow: all reviewed forms have substantive fields and real API mutations, the production bundle builds at 91.28 kB gzip, and canonical screens already represent operational states. Remediation can preserve working product contracts while replacing the weak shell around them.

The proposal should change from implementing every row independently to a dependency-led convergence program. Restore TypeScript and verification first. Resolve the architectural conflict around Tailwind/shadcn before building shared accessible primitives. Then establish route/workspace state and progressive disclosure, followed by the responsive shell, because those determine page ownership and test seams. Apply primitives to login and high-risk workflow/payroll actions, then finish responsive tables, states, i18n, search, skeletons, and theme completeness. Each slice should retain current REST/auth/RBAC behavior and ship behind regression tests.

### Contrarian

“Remediate all findings” treats observations and implementation rows as independent obligations even though many duplicate each other, some are speculative because browser verification was not executed, and several are product changes. Routing, workspace scoping, search, password reset, i18n, offline behavior, and confirmation policy require accepted behavior or backend contracts. Each finding must first be classified as a defect, architecture gap, evidence gap, or requirement amendment.

The review also conflicts with architecture over Tailwind/shadcn. Local primitives could close a review row while remaining architecturally nonconformant; a wholesale framework migration combined with routing, theming, and state changes creates a broad regression surface. Tooling and independent browser evidence must be restored before coding. Workspace switching is especially sensitive: binding labels to routes without server-enforced scope could create a confidentiality defect. Dark mode, full i18n, skeleton polish, and broad search should not block release unless traced to signed requirements, and confirmations should apply only to proven irreversible/finalizing actions.

### First Principles Thinker

The actual objective is not to implement 55 overlapping rows; it is to make the UI demonstrably satisfy product contracts and every blocking release gate. The minimal correct target is a routed, permission-aware SPA with meaningful workspaces, a responsive shell, a small approved primitive layer, canonical recoverable states, and guarded sensitive workflows whose visible actions correspond to real contracts. Accessibility belongs in primitives so many defects collapse into systemic changes.

Execution begins by restoring the harness and freezing route/workspace/action behavior. The Tailwind/shadcn conflict must be resolved in favor of the governing architecture unless formally amended. Critical flows migrate vertically—login, workflow, payroll, then remaining modules. Responsive tables, states, confirmations, and safe errors belong inside those slices. Dark theme, i18n, skeleton polish, and search follow where accepted requirements require them. Release means all blocking gates pass with green typecheck, tests, viewport checks, keyboard traversal, and accessibility scans.

### Outsider

To a newcomer, the strategy sounds precise but is not executable. “Release-ready” is a label without a measurable acceptance matrix, while screenshots, keyboard traversal, axe, authenticated fixtures, and a working test environment were never run. A newcomer would require every blocking gate to map to observable tests, dependencies, owners, and evidence.

The documentation tells two stories about the design system, and several labels hide product decisions: meaningful workspaces, real routes, supported password reset, search, locale policy, error taxonomy, and design approval. HRMS acronyms also hide which journeys are critical or legally irreversible. A staged strategy should first restore verification, decide the architecture conflict, and define three role-based critical journeys with seeded data. Behavioral trust and safety come before theme, i18n, skeletons, or search. All findings remain traceable, but verified gates—not completion percentage—govern release.

### Executor

The feasible route consolidates the work into packages. Restore tooling; freeze navigation/workspace/auth contracts; establish tokens and approved accessible primitives; repair routing and progressive disclosure; add mobile navigation; fix login, workflow controls, confirmations, error recovery, and false states; then complete tables, theme, i18n, loading, and notification polish. Some design-system-neutral quick fixes can proceed after the baseline is green.

A practical model is two frontend engineers plus a test/accessibility owner, with a time-boxed contract owner. Deliver small mergeable slices with feature flags for routing, theme, and workspace behavior. Preserve hash navigation until route parity passes and retain old CSS during token migration. The exact first action is to repair the TypeScript dependency through the approved source, clean-install, and record web checks and PH-05E before behavior changes.

## Peer Reviews

Anonymization mapping: **A = Contrarian, B = Executor, C = Proponent, D = Outsider, E = First Principles Thinker.**

### Proponent-style Reviewer

Response E was strongest because it converts the sprawl into a falsifiable outcome—pass the 16 blocking gates—and pairs the minimal target with a green harness and contract freeze. Response C's largest blind spot was treating Tailwind/shadcn as already authorized. All five missed a finding-to-proof closure protocol across Employee, Manager, and Admin roles, including denied-access cases and workspace boundaries.

### Contrarian-style Reviewer

Response E was strongest for aligning implementation with release policy and reducing contract drift. Response C assumed a component-library decision and did not specify how current workflows would be preserved. All five missed stable per-finding disposition and strong negative authorization checks for cached, deep-linked, and stale data.

### First-Principles-style Reviewer

Response E was strongest because it reconstructed the target from the release rule rather than the audit inventory. Response C risked equating shadcn adoption with accessibility. All five missed deterministic configuration and test data: named personas, workspace fixtures, controlled loading/error modes, and expected permission matrices.

### Outsider-style Reviewer

Response D was strongest because it made evidence and user journeys understandable without assuming HRMS context. Response C's blind spot was migration cost and the implied authority to change dependencies. All five missed explicit validation with representative end users and assistive-technology users; automated checks alone cannot prove the journeys are understandable.

### Executor-style Reviewer

Response B was strongest because it named dependencies, staffing, feature flags, rollback, and an exact first action. Response D's blind spot was lack of concrete resource and sequence detail. All five initially underweighted the dependency-amendment workflow and integration risk from an already active, dirty feature branch.

## Second Pass

### Contested Point: Immediate Tailwind/shadcn Adoption vs Approval Gate

**Proponent revised position:** the strongest objection is authorization. Architecture text alone may not permit an uncontrolled dependency migration. Resolve the design-system authority first; proceed with design-neutral behavior/tests; then migrate incrementally if approved or implement equivalent local contracts if architecture is amended.

**Contrarian revised position:** the strongest opposing point is double migration. Because architecture explicitly names Tailwind/shadcn, a bespoke system may be throwaway. Treat adoption as an early enabling migration after baseline and authority confirmation, prove it on login/shell, then migrate vertical slices rather than rewriting everything.

**First Principles revised position:** use a formal Phase 0 decision and reversible bridge. Tokens, accessibility contracts, component APIs, and behavior tests can be defined without committing to broad implementation. Once approved, prove Button, Input, Alert, Dialog, and a critical journey before expanding.

The Chairman adopts the combined position: **formal decision first, early foundation second, incremental migration third.**
