# Foundation Services Tests (PH-03)

Status: implemented for PH-03 agentic gate.

## Executable Gate

```bash
bash docs/spec/pipeline/checks/ph-03.sh
```

Expected result:

```text
PH-03 gate GREEN
```

## Local Service Test Command

```bash
npm run check
```

Current coverage:

| Area | Evidence |
|---|---|
| Authority resolver | reporting-chain, statutory authority, delegation/acting-charge, SoD block, committee quorum, ambiguous authority fail-closed |
| G12 SR ingestion | idempotency replay, idempotency conflict, semantic dedup, source-driven reversal, append-only API shape |
| G13 document vault | create, attach, legal hold blocks disposal |
| G01 employee master | masked PII serialization, governed identity change posts to G12, audit evidence |
| P01 synthetic workflow | start, task, approve action, resolution evidence, audit row, notification |
| Tenant isolation | cross-tenant employee/document/SR reads return no data |
| Migration staging | staging reconciliation does not mutate production employee records |
| Security | all PH-03 service operations are protected; public error envelope hides internal stack details |

Latest local result:

```text
PH-03 gate GREEN; PH-02 regression passed, npm run check passed, G01/G12/G13 OpenAPI parsed, manifest/dependency evidence verified.
```
