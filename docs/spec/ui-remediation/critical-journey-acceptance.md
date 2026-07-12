# UIR-00 Critical Journey Acceptance

Status: **APPROVED BY USER — 2026-07-11**  
Date: 2026-07-11

## Shared evidence matrix

Every journey is exercised at 360×800, 768×1024, and 1280×800 using pointer and keyboard. Login, shell, workflow, payroll, and one representative module receive axe scans. The denied persona covers direct URL, stale in-memory selection, browser history, and workspace-switch attempts. Screenshots must not contain real PII.

## CJ-EMPLOYEE

Authenticate, enter Me, navigate to profile and leave, submit a permitted request, observe pending/success/error recovery, return with browser history, and confirm no Team/Admin destinations or cached protected content are exposed.

## CJ-MANAGER

Authenticate, enter My Team, navigate to inbox and a team surface, review a task, exercise mandatory reason validation, perform a permitted action, cancel a terminal-action confirmation, then complete it. Denied Admin URLs fail closed.

## CJ-ADMIN

Authenticate, enter Admin, navigate to workflow configuration and payroll, validate/simulate a draft, confirm a governed publish/finalizing action, inspect visible safe feedback, and verify that disabled lifecycle actions explain prerequisites accessibly.

## Blocking acceptance

All 16 blocking gates in `docs/reviews/ui-review-all-2026-07-11.md` must be PASS. “PARTIAL” is not completion. Typecheck, build, web/API regression, PH-05E, role/viewport journeys, authorization negatives, keyboard traversal, accessibility scans, and required evidence artifacts must all execute successfully.
