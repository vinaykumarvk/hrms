# UIR-00 Auth and Action Decisions

Status: **APPROVED BY USER — 2026-07-11**  
Date: 2026-07-11

## Login and session

- Preserve the current session/auth mechanism and its permissions. UIR remediation does not introduce SSO or a new auth endpoint.
- Login submission gains client loading/double-submit/error-clear behavior without changing credential semantics.
- Intended-route restoration is allowed only for a same-origin route that passes permission checks after authentication.
- Session expiry clears protected client state and returns to login with a generic message. Tokens, credentials, and protected route data are never placed in the URL or local storage.
- Password reset has no approved API contract in the reviewed artifacts. The current misleading “Forgot password?” pseudo-flow is removed/quarantined. A real reset flow requires a later contract amendment.

## Workflow configuration

- Preserve the approved PH-05 minimum YAML-backed model for validate, simulate, submit-for-review, and maker-checker publish.
- Every visible control must change visible state or invoke an approved operation.
- Client-side evidence export may download the current non-secret draft, validation, simulation, and status as a local artifact. No server export endpoint is invented.
- Unsupported operations are hidden rather than rendered as no-ops.

## Sensitive action classification

Confirmation is required for irreversible or finalizing actions: workflow cancel, workflow-config publish, payroll lock/finalize/pay/bank-batch release where present, destructive document disposal, and equivalent contract-identified terminal actions. Approve/reject/send-back/query/delegate and ordinary creates remain protected by validation, permissions, idempotency, and visible pending state but do not receive blanket confirmation unless their governing contract declares them terminal.

Confirmations must name the object and action, use explicit labels, trap/return focus, close on Escape where cancellation is safe, and never rely on generic “OK”.

## Errors

- Use existing registered display/error codes only where useful for support; do not expose stack traces, paths, SQL, secret IDs, tokens, or PII.
- Prefer a user-readable recovery message plus existing correlation/reference data. UIR does not invent error codes.

## Quarantined behavior

Password reset API, new server evidence-export API, new locale set, and new workspace data scopes remain out of scope until an approved amendment exists.
