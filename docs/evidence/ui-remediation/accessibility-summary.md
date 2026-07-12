# UI Remediation Accessibility Evidence

Date: 2026-07-11

Automated Chromium evidence uses Playwright 1.55.1 with `@axe-core/playwright` 4.10.2. `foundation.spec.ts` reports zero axe violations on the login surface. `critical.spec.ts` reports zero axe violations on the authenticated Employee workflow shell. Both scans are real browser runs, not source-only claims.

Static/component evidence verifies shared focus-visible, 44px targets, reduced motion, disabled/loading states, semantic live feedback, and Radix Dialog/Drawer focus management. Login contrast failures initially found by axe were corrected and the scan rerun GREEN.

Coverage: login, responsive shell, routed navigation, mobile drawer, workflow configuration publish dialog, and representative authenticated workspace. ErrorBoundary behavior is implementation-reviewed but lacks a forced render-failure browser fixture and remains partial in the ledger. Remaining conditionally deferred features: dark theme (not a confirmed shipped requirement) and multilingual locale set (policy not supplied). Light-theme automated accessibility is the release matrix; a separate computed contrast matrix remains follow-on evidence.

Commands:

- `npm run web:test:e2e -- --project=chromium`
- `node --test apps/web/test/ui-remediation-primitives.test.cjs`
- `node --test apps/web/test/ui-remediation-critical.test.cjs`
