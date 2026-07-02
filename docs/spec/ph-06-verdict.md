# PH-06 Verdict — Vertical-Slice Proof

Status: machine evidence GREEN, human gate pending.

Recommendation: proceed to the human gate for the scale module build decision. The PH-06 proof shows that the platform spine can drive both selected vertical slices without manual DB edits:

- G03 leave uses P01 `REPORTING_CHAIN`, P01 delegation, leave balance reservation/debit, a G04 outbox, G12 `LEAVE_APPROVED` append, P05 audit, and X.2 notifications.
- G05 transfer uses P01 `POSITION_AUTHORITY`, SoD-safe delegation behavior, `PARALLEL_ALL_OF` clearance, `DEEMED_CLEARED` SLA outcome, G13 transfer/joining documents, G12 `TRANSFER_JOINED` append, P05 audit, and X.2 notifications.

## Evidence

- `bash docs/spec/pipeline/checks/ph-06a.sh` GREEN: PH-06A plan, slice YAML, OpenAPI binding, and PH-06A..E pipeline wiring.
- `bash docs/spec/pipeline/checks/ph-06b.sh` GREEN: G03 backend route/service tests passed.
- `bash docs/spec/pipeline/checks/ph-06c.sh` GREEN: G05 backend route/service tests passed.
- `bash docs/spec/pipeline/checks/ph-06d.sh` GREEN: G03/G05 UI proof typecheck, Vite build, and web tests passed.
- `npm run check` GREEN: 68 API subtests passed, including PH-06 route registry and conformance tests.
- `npm run web:check` GREEN: 19 web subtests passed, including PH-06 vertical-slice UI proof.

## Architecture Reading

The platform decision is holding:

- Workflow-specific work belongs in P01 plus resolver configuration.
- HRMS-specific work remains in modules: G03 owns leave balance/ledger behavior; G05 owns transfer lifecycle behavior.
- G12 remains append-only and source-controlled. G03 does not write as G03; the SR event is attributed to G04 via the G04-ready outbox path. G05 writes as G05.
- G13 remains the document surface for generated transfer and joining evidence.

## Caveats

- Runtime is still in-memory service proof, consistent with PH-03 and PH-04. SQL-backed repositories need a later persistence proof before UAT.
- The web proof is fixture-backed for demo surfaces; backend route tests prove the service/API path.
- G05 is intentionally minimal: one order, three clearances, one deemed branch, and joining. Full transfer drives, representations, estate, and late-joining review remain PH-08 scope.

## Human Gate

PH-06E remains a human gate. The review decision is whether this evidence is sufficient to scale module build into PH-07 through PH-10, or whether PH-07 should first narrow scope and harden persistence/live API wiring.
