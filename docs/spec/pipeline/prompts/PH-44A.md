# PH-44A — Raise contract coverage: G13 checkout-lock + read route exposure

## Objective
Continue the coverage workstream into G13 (25.4%): expose the document checkout-lock lifecycle, rescan, and
access-audit / scan-result / module-ref reads as kernel routes over already-tested `documentVault` backing.

## Context
- Backing (`apps/api/src/modules/g13/documentVaultService.ts`): `checkout`, `releaseCheckout` (holder-only),
  `getCheckoutLock`, `rescan` (PENDING_SCAN only), `listAccessAudit`, `listScanResults`, `listByModuleRef`.
  `checkIn` is already routed; `checkout` was not.
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- Preserve guards: only the checkout holder releases (403); second release fails (412 not checked out).
- Avoid path collisions with `/api/v1/documents/{id}` — use the `:action` / query convention for the
  module-ref list (a `/by-module-ref` sub-path is captured as an `{id}` and 404s).
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 436/33% → 443/33.5%.

## Evidence required
- 7 routes in `g13.routes.ts`; `apps/api/test/ph44a-*.test.cjs` covering checkout→read→release (+ second-
  release 412), the audit/scan reads, and the module-ref validation guard.
- `bash docs/spec/pipeline/checks/ph-44a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is a stub, or a guard's setup is too heavy (test the guard path; note engine coverage).
