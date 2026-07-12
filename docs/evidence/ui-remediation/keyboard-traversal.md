# UI Remediation Keyboard Traversal Evidence

Date: 2026-07-11

Automated traversal confirms a visible focus outline on login. The mobile menu opens from the semantic “Open menu” button, exposes an accessible dialog name, supports link activation, closes after navigation, and transfers focus to the destination heading. Radix-backed Drawer and Dialog provide Tab containment, Escape dismissal, body-scroll management, and focus return.

The workflow configuration journey reaches Validate, Submit for review, Publish, and the explicit “Keep in review” cancellation action without pointer-only elements. All navigation entries are anchors with icons marked decorative. Workspace controls are native buttons rather than incomplete ARIA tabs.

Evidence commands:

- `npm run web:test:e2e -- --project=chromium --grep @critical`
- `npm run web:test:e2e -- --project=chromium --grep "focus indicator"`

No positive `tabIndex` exists. Destination headings use `tabIndex={-1}` only for programmatic route focus.

