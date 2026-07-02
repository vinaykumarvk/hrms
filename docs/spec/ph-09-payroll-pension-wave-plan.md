# PH-09 Payroll and Pension Wave Plan

PH-09 builds the G10 Payroll and Benefits and G11 Retirement and Pension wave after PH-08 made upstream employee, leave, transfer, promotion, disciplinary, Service Register, and document facts stable enough for deterministic money calculations.

The implementation remains inside the HRMS modular monolith. PH-09 does not introduce a separate payroll service, a separate pension service, or live bank/treasury integrations. It adds deterministic in-memory module services with fixed-point money arithmetic, provenance completeness checks, rule-version snapshots, and X.3 sandbox export markers. Persistence hardening and live integrations remain later enterprise hardening work.

| Step | Gate | Scope | External oracle |
|---|---:|---|---|
| PH-09A | auto | Freeze PH-09 detailed plan, prompts, executable checks, pipeline wiring, and G10/G11 OpenAPI binding markers. | `bash docs/spec/pipeline/checks/ph-09a.sh` |
| PH-09B | auto | Implement G10 salary structures, locked payroll runs, deterministic payroll calculation traces, adjustment feeds, last-pay-drawn output, and X.3 bank sandbox export. | `bash docs/spec/pipeline/checks/ph-09b.sh` |
| PH-09C | auto | Implement G11 service-verification gate, qualifying service calculation, pension/gratuity/commutation trace, PPO issue, and G12 SR posting. | `bash docs/spec/pipeline/checks/ph-09c.sh` |
| PH-09D | auto | Prove cross-module controls: G03 LOP and G09 penalty impacts, G10 last-pay-drawn feeds G11, maker-checker SoD, and provenance completeness. | `bash docs/spec/pipeline/checks/ph-09d.sh` |
| PH-09E | auto | Add UI proof, PH-09 verdict, manifest evidence, and full API/web regression coverage. | `bash docs/spec/pipeline/checks/ph-09e.sh` |

## Scope Rules

- All money amounts are stored and tested as integer minor units. UI display may render formatted rupees, but calculations must remain fixed-point and reproducible.
- No payroll or pension calculation may proceed unless its input provenance is complete and recorded in the calculation trace.
- Every G10 payroll run snapshots its rule version and input set before calculation. Recomputing with the same snapshot must produce the same totals.
- Payroll approval and pension sanction use maker-checker separation. The same actor who creates the run/case may not approve or sanction it.
- Financial exports use X.3 sandbox stubs only. PH-09 must not hardcode bank, treasury, PDA, identity, or pension disbursement endpoints.
- G11 must not issue a PPO until Service Register/service facts are certified and locked.
- G11 writes separation and PPO events through the G12 SR ingest port. It must not mutate SR ledger state directly.
- PH-09 remains an executable proof wave. Full statutory edge coverage for every G10/G11 BRD case is deferred to the hardening backlog after deterministic controls are proven.

## Evidence

- `apps/api/test/ph09-g10-payroll.test.cjs`
- `apps/api/test/ph09-g11-pension.test.cjs`
- `apps/api/test/ph09-compensation-integration.test.cjs`
- `apps/web/test/ph09-compensation-wave.test.cjs`
- `docs/spec/ph-09-verdict.md`

## Exit Position

PH-09 is complete when G10 and G11 expose protected API surfaces, deterministic calculation traces, SoD enforcement, X.3 sandbox export markers, UI proof panels, manifest evidence, and full API/web checks. PH-10 can then consume locked payroll/pension facts for analytics, performance validation, security review, release evidence, and deployment hardening.
