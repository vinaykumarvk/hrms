# UIR-00 Design-System Decision

Status: **APPROVED BY USER — 2026-07-11**  
Date: 2026-07-11

## Decision

Treat `docs/architecture.md:75` as the target architecture: React, TypeScript, Tailwind CSS, and shadcn/ui-compatible accessible primitives. The PH-05 allowance for local compatible primitives (`docs/spec/ph-05-ui-implementation-plan.md:43`) is a temporary bridge when dependencies are unavailable, not an amendment that removes the architecture target.

No runtime dependency is added in UIR-00. UIR-05 may add deterministic Tailwind/shadcn and browser-test dependencies only after this human gate is approved. Migration must be incremental: tokens and a minimal primitive proof slice first; shell/login/workflow/payroll next; remaining modules later. Existing CSS remains until migrated slices pass behavioral and visual parity.

## Required component contract

Regardless of implementation library, Button, Input, Select, Field, Alert, Card, Dialog, Drawer, Table, Skeleton, and notification primitives must provide semantic markup; default/hover/active/focus-visible/disabled/loading/error states as applicable; 44×44 minimum targets; reduced-motion support; WCAG AA contrast; focus trap/return for overlays; and deterministic keyboard behavior.

## Dependency envelope

- Allowed after approval: version-pinned Tailwind/shadcn support and browser/a11y development dependencies needed by UIR-05.
- Forbidden without a new amendment: changing React, API/auth/RBAC/state/error contracts, adding unrelated production libraries, or replacing functional module behavior during styling migration.
- Rollback: remove the new foundation and retain existing CSS/components. No broad rewrite is authorized.

## Evidence

- Architecture target: `docs/architecture.md:75,91,294-295`.
- Temporary compatibility allowance: `docs/spec/ph-05-ui-implementation-plan.md:43`.
- Council resolution: `doc/evaluations/hrms-ui-remediation-council-report-20260711.md`, “Second Pass”.
