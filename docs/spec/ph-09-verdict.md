# PH-09 Verdict - Payroll and Pension Wave

## Gate Decision

PH-09 is GREEN for agentic progression to PH-10.

The compensation wave now has executable backend and UI evidence for G10 Payroll and Benefits and G11 Retirement and Pension. The implementation stays inside the established modular monolith and uses the shared P02 authorization, P05 audit, G12 Service Register, and G13 document vault services. Financial integrations remain X.3 sandbox exports only.

## Scope Delivered

### G10 Payroll and Benefits

G10 implements salary structures, adjustments, payroll run creation, input locking, computation, reconciliation, maker-checker approval, locking, disbursement, and last-pay-drawn output.

Payroll calculation is deterministic and fixed to a locked input snapshot. Each run records `RULE_VERSION_SNAPSHOT`, `INPUT_LOCKED`, and `PROVENANCE_COMPLETE` before calculation. The computed line trace records `PAYROLL_TRACE`, and G03 leave-without-pay inputs are represented as `G03_LOP_PAYROLL_IMPACT`.

Financial export is represented by `BANK_X3_EXPORT` through `X3_BANK_SANDBOX`. No live bank endpoint or hardcoded financial integration was introduced. G10 emits `LAST_PAY_DRAWN` / `G10_LAST_PAY_DRAWN_FEED` facts for downstream G11 calculation.

### G11 Retirement and Pension

G11 implements separation case creation, `SR_VERIFICATION_GATE`, `QUALIFYING_SERVICE_LOCKED`, qualifying-service calculation, deterministic pension/gratuity/commutation calculation, maker-checker pension sanction, PPO generation, and Service Register posting.

Pension calculation consumes G10 last-pay-drawn rather than duplicating payroll facts. The trace records `PENSION_CALC_TRACE` with the pension rule version, last-pay trace hash, and exact calculation inputs.

G09 disciplinary effects are represented in qualifying service through `G09_PENALTY_QS_EXCLUSION`. Pension cases cannot pass the calculation gate with incomplete Service Register/service verification facts.

### SoD and Provenance Controls

G10 enforces `PAYROLL_SOD`: the payroll maker cannot approve the same run. G11 enforces `PENSION_SOD`: the pension case maker cannot sanction the same case.

The integration test proves the path from G03 LOP and G09 penalty impacts into G10/G11, and confirms `PROVENANCE_COMPLETE` before money calculation proceeds.

## SR Conformance

SR conformance is preserved for pension events:

| Module | SR writer | Example event |
|---|---|---|
| G11 | G11 | `SEPARATION_RECORDED`, `PPO_ISSUED` |

G11 posts separation and PPO facts through G12 ingest and records `G11_SR_POSTED`. It does not mutate SR ledger state directly.

## Evidence

Primary backend evidence:

- `apps/api/src/modules/g10/payrollService.ts`
- `apps/api/src/modules/g11/pensionService.ts`
- `apps/api/src/routes/g10.routes.ts`
- `apps/api/src/routes/g11.routes.ts`

Primary UI evidence:

- `apps/web/src/modules/g10/PayrollWorkspace.tsx`
- `apps/web/src/modules/g11/PensionWorkspace.tsx`
- `apps/web/test/ph09-compensation-wave.test.cjs`

Primary test evidence:

- `apps/api/test/ph09-g10-payroll.test.cjs`
- `apps/api/test/ph09-g11-pension.test.cjs`
- `apps/api/test/ph09-compensation-integration.test.cjs`

Gate evidence:

- `bash docs/spec/pipeline/checks/ph-09a.sh`
- `bash docs/spec/pipeline/checks/ph-09b.sh`
- `bash docs/spec/pipeline/checks/ph-09c.sh`
- `bash docs/spec/pipeline/checks/ph-09d.sh`
- `bash docs/spec/pipeline/checks/ph-09e.sh`
- `npm run check`
- `npm run web:check`

## Residual Caveats

- Stores remain in-memory, consistent with PH-03 through PH-08. Persistence hardening remains PH-10+ work.
- G10/G11 prove representative deterministic controls and integration paths, not every statutory payroll/pension BRD edge case.
- Bank, treasury, PDA, identity, and pension disbursement integrations remain X.3 sandbox stubs.
- UI panels are fixture-backed proof surfaces; backend route and service tests prove live behavior.

## Recommendation

Proceed to PH-10. PH-09 provides locked compensation facts, deterministic traces, and pension SR events for analytics, security/performance hardening, release evidence, and deployment planning.
