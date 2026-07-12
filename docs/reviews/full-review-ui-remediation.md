# Full Review: UI remediation

## Verdict

CONDITIONAL after repair — all implementation-eligible CRITICAL/HIGH findings were repaired and the complete oracle is GREEN. Production release remains blocked on the explicit authentication and deployment-security amendments below.

## Scope

- target: UI remediation diff and `docs/spec/ui-remediation-pipeline`
- selected path: standard, report-first `no-fix`, followed by the user-authorized `--fix all`
- files reviewed: changed web application, UI tests, API bridge tests, pipeline checks, evidence, release packet, package manifests
- artefacts used: `docs/reviews/ui-review-all-2026-07-11.md`; `doc/evaluations/hrms-ui-remediation-council-report-20260711.md`; `docs/spec/phased-plan.yaml`; `docs/spec/ui-remediation/*`; `docs/spec/ui-remediation-pipeline/*`

## Checks run

| Check | Ran? | Result | Evidence |
|---|---|---|---|
| UIR-08 blocking gate | yes | GREEN, 16/16 | `bash docs/spec/ui-remediation-pipeline/checks/uir-08.sh` |
| Web unit/static tests | yes | 153/153 pass | UIR-08 command output |
| Browser tests | yes | 14/14 pass | UIR-08 command output |
| PH-05E | yes | GREEN | UIR-08 command output |
| Dependency audit | yes | 0 known vulnerabilities | `npm audit --json` |
| Security review | yes | FAIL | independent security domain pass |
| UI/accessibility review | yes | CONDITIONAL | independent UI domain pass and axe/browser evidence |
| Quality/traceability review | yes | FAIL | independent quality domain pass |
| Infra review | no | skipped | no production deployment, CI, migration, or container files are in this target |
| Cross-FR review | no | skipped | remediation changes shared UI behavior but do not amend FR contracts |

## Findings

| ID | Severity | Domain | File:line | Claim | Evidence | Recommended action | Repair mode eligible? |
|---|---|---|---|---|---|---|---|
| FR-01 | CRITICAL | Security | `apps/web/src/app/session.ts:15`, `apps/web/src/app/session.ts:121`, `apps/web/src/App.tsx:62` | A hardcoded credential can mint an unsigned privileged bearer token in any production build. | Credential constants, `{ alg: "none" }`, and unconditional login composition are production source paths. | Confine demo login to a compile-time development boundary, source credentials from local environment, and prove the production artifact contains neither credentials nor unsigned token minting. | yes |
| FR-02 | CRITICAL | Security | `apps/web/src/app/session.ts:54`, `tools/local-api-server.mjs:28` | Browser and local bridge decode unverified claims; the bridge also supplies broad defaults. | Neither path verifies signature/issuer/audience; the bridge constructs server actor context from decoded claims. | Treat browser claims as presentation-only, harden the local bridge as test-only without privilege defaults, and route production authentication to a verified IdP/server contract. | partial; production IdP is amendment-required |
| FR-03 | HIGH | Security | `apps/web/src/App.tsx:54`, `apps/web/src/app/session.ts:76`, `apps/web/src/api/hrmsClient.ts:1020` | Expiry is checked only on initial load and 401 responses do not centrally clear protected UI state. | No running expiry timer or authentication-failure callback exists. | Add scheduled expiry and central 401/403 session termination with a generic re-authentication message. | yes |
| FR-04 | HIGH | Evidence | `docs/release/ui-remediation-readiness.md:8`, `docs/evidence/ui-remediation/final-command-log.md:18`, `docs/spec/ui-remediation-pipeline/checks/uir-08.sh:6` | Release evidence claims behavioral checks and final results that are absent or only source-regex assertions. | The final log contains a placeholder; ErrorBoundary and double-submit assertions are not behavioral. | Add executable behavioral tests, align the oracle with stated checks, append exact results, and downgrade any unsupported closure. | yes |
| FR-05 | MEDIUM | Reliability | `apps/web/src/api/hrmsClient.ts:1031` | A caller-provided abort signal disables the default 15-second timeout. | `init.signal ?? AbortSignal.timeout(...)` selects only one signal. | Compose caller and timeout signals and add executable abort tests. | yes |
| FR-06 | MEDIUM | Accessibility | `apps/web/src/components/ui/Field.tsx:4` | Hint/error text is not programmatically associated with the form control. | `aria-describedby` is never attached to the child; a custom data attribute is placed on the paragraph. | Clone a single valid child with merged `aria-describedby` or expose the IDs through a render contract; behaviorally test it. | yes |
| FR-07 | MEDIUM | React correctness | `apps/web/src/App.tsx:99` | Browser history is mutated during render. | `replaceState` executes in the render path. | Move canonical URL replacement into an effect. | yes |
| FR-08 | MEDIUM | Observability | `apps/web/src/app/ErrorBoundary.tsx:18` | The error boundary swallows exceptions, leaving render failures unobservable. | `componentDidCatch` has an empty body. | Invoke an injected sanitized reporting boundary and test it without exposing error details to users. | yes |
| FR-09 | MEDIUM | Traceability | `docs/spec/ui-remediation/finding-closure-ledger.yaml:4` | Defaulting every finding to closed overstates runtime verification. | Several closure tests named in the ledger are source checks or have no direct evidence ID. | Add per-finding evidence references and keep unverified items open/deferred. | yes |
| FR-10 | MEDIUM | Security/Infra | `apps/web/vite.config.ts:4`, `apps/web/src/app/session.ts:114` | No production CSP/security-header policy is present while bearer data is browser-readable. | Target contains no deploy header configuration or documented threat model. | Add deployment CSP/HSTS/nosniff/referrer/permissions policy when the deployment surface is defined; prefer HttpOnly cookies if architecture permits. | no, amendment/deployment required |
| FR-11 | LOW | Test isolation | `apps/web/playwright.config.ts:17` | Local browser gates may reuse stale servers. | Both server entries set `reuseExistingServer: true`. | Disable reuse for gate/CI execution or bind isolated ports. | yes |
| FR-12 | HIGH | Accessibility evidence | `apps/web/test/e2e/foundation.spec.ts:18`, `docs/evidence/ui-remediation/accessibility-summary.md:5` | The WCAG-AA claim is broader than axe and keyboard checks. | Axe discards moderate violations; keyboard evidence does not traverse the claimed drawer/dialog journey. | Fail on all unwaived axe violations and add Tab/Shift+Tab/Enter/Escape journey coverage. | yes |
| FR-13 | HIGH | Responsive evidence | `apps/web/test/e2e/evidence.spec.ts:16`, `docs/release/ui-remediation-readiness.md:13` | Authenticated-shell screenshots do not prove overflow, target size, safe-area, or reachability behavior. | Only login has executable overflow assertions. | Add authenticated viewport, drawer, long-content, and safe-area assertions. | yes |
| FR-14 | HIGH | Login resilience | `apps/web/src/app/LoginPanel.tsx:26` | A rejected asynchronous sign-in leaves the form permanently busy. | Await has no `try/catch/finally`; the synchronous demo masks the failure. | Always clear busy state, show a generic live error, and add a rejected-promise test. | yes |
| FR-15 | MEDIUM | Login accessibility | `apps/web/src/app/LoginPanel.tsx:74` | Credential errors are associated only with the password field. | Employee ID lacks `aria-invalid`/`aria-describedby` while the error describes both credentials. | Associate both controls or focus a form-level error summary. | yes |
| FR-16 | MEDIUM | Design-system adoption | `apps/web/src/workflow/TaskActionPanel.tsx:52`, `docs/spec/ui-remediation/finding-closure-ledger.yaml:81` | Primitive adoption is partial while UI-11 defaults to closed. | Repository scan finds 126 raw form controls and mixed primitives in critical surfaces. | Mark adoption partial and migrate critical journeys under a measured follow-on rather than claiming complete closure. | yes (traceability); full migration is follow-on |
| FR-17 | MEDIUM | Error recovery | `apps/web/src/app/ErrorBoundary.tsx:23`, `docs/release/ui-remediation-readiness.md:24` | Retry can immediately rethrow the same deterministic child and no behavioral recovery test exists. | Retry only clears state without remounting/reloading. | Use a safe reload/start recovery and behaviorally test the fallback and focus. | yes |

## Component substance check

| Component | File | Inputs | API calls | Data renders | Verdict |
|---|---|---|---|---|---|
| Application router | `apps/web/src/App.tsx` | path, session, permissions | composed clients | one substantive workspace per route | substantive; security fixes required |
| Login | `apps/web/src/app/LoginPanel.tsx` | employee ID, password | local demo exchange | errors/loading/session message | substantive; production auth blocker |
| Workflow configuration | `apps/web/src/workflow/WorkflowConfigConsole.tsx` | version/action controls | client-side contract only | outcomes and confirmation | substantive within approved no-new-API disposition |
| Payroll run console | `apps/web/src/modules/g10/PayrollRunConsole.tsx` | run/actions | HRMS client | run state and terminal confirmations | substantive |
| UI primitives | `apps/web/src/components/ui` | typed component props | not applicable | reusable controls/feedback | substantive; Field association defect |

No newly claimed user-facing component is a skeleton.

## Traceability impact

The 28-item closure ledger must be amended with direct evidence IDs and corrected states for findings whose executable proof is incomplete. UIR-08 may not remain release-ready until FR-01 through FR-04 are resolved and the final command log is regenerated.

## Required amendments

- Production authentication/identity-provider integration and server-side token verification require an auth contract amendment; the current specification explicitly contains no login endpoint.
- Production CSP/security headers and cookie/token storage policy require the deployment architecture surface to be defined.
- Dark theme, localization, and password recovery remain explicitly deferred to their recorded owners and are not silently added by this repair.

## Verification commands

- `npm run check`
- `npm run web:check`
- `npm run web:test:e2e`
- `npm audit --json`
- `bash docs/spec/pipeline/checks/ph-05e.sh`
- `bash docs/spec/ui-remediation-pipeline/checks/uir-08.sh`
- production build negative scan for demo credentials and `alg:none`

## Remaining risks

Production release remains blocked until a verified authentication contract and deployment security policy exist. Client route guards improve UX and data minimization but are not authorization boundaries; the API must remain authoritative.

## Repair and final no-fix review

User-authorized mode: `--fix all`.

- FR-01 resolved: demo credential exchange is compile-time development-only and the production bundle negative scan passes.
- FR-02 implementation portion resolved: the local bridge refuses production mode and no longer invents roles or wildcard field grants. Verified production identity remains amendment-required.
- FR-03 resolved: running expiry and 401 termination clear the protected session with a generic message.
- FR-04/12/13 resolved or corrected: final evidence is populated; axe now fails on every violation; authenticated overflow and keyboard drawer/dialog paths execute in Chromium. Forced ErrorBoundary failure remains explicitly partial rather than claimed.
- FR-05 through FR-08, FR-11, FR-14, FR-15, and FR-17 resolved in implementation and targeted/full checks.
- FR-09/16 corrected: incomplete token/design-system/error-boundary/safe-area evidence is `partial`, not closed.
- FR-10 remains amendment-required.

Final no-fix verdict: **CONDITIONAL**. No remaining implementation-level CRITICAL or HIGH finding was reproduced. The final oracle passed API, web, browser, PH-05E, dependency-audit, and production-artifact negative checks. The two architectural requirements remain visible and block production release rather than blocking completion of this remediation implementation.
