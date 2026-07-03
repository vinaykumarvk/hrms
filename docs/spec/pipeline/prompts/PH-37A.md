# PH-37A — Contract-coverage gate (the named CI-conformance item)

## Objective
Replace the hand-waved "implemented routes cover only a fraction of the ~1,306 OpenAPI operations" caveat
(carried by every tranche verdict) with a **measured, tracked, executable** per-module coverage metric and a
ratchet gate so coverage can only go up.

## Context
- Contract: `docs/contracts/openapi/*.yaml` (per-module OpenAPI, ~1,323 operations counted exactly).
- Live routes: `createFoundationApi(createFoundationServices()).listRoutes()` — each carries an `operationId`
  whose prefix (`g06.` …) attributes it to a module.

## Constraints
- Automate measurement, not judgment: the oracle must independently recompute and tie the implemented total
  to the live registry; it must not trust a hand-written number.
- Be honest about the metric's limitation: it is **count-based** per module, not per-operation path matching.

## Freedom
Tool language/shape and report layout are the implementer's choice.

## Evidence required
- `tools/contract-coverage.mjs` (prints a markdown table + `--json`).
- `docs/reviews/contract-coverage-<date>.md` baseline with the per-module table, the ratchet floor, and the
  stated limitation.
- `apps/api/test/ph37a-*.test.cjs` asserting the tool ties to `listRoutes()` and does not regress below floor.
- `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN (external): recompute + tie-to-registry + floor + suite green.

## Escalate when
- The OpenAPI op count is ambiguous (nested/ref'd operations) — record the counting rule in the report.
