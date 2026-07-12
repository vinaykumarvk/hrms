# UI remediation pipeline runner

This harness compiles `docs/spec/phased-plan.yaml` → `ui_remediation_2026_07_11` into one fresh goal per phase with external checks. It automates sequencing, never judgment.

## Usage

```bash
cd docs/spec/ui-remediation-pipeline
./run.sh
./run.sh --status
./run.sh --execute
```

The driver refuses `--execute` on `main`/`master`, records a git snapshot and rollback command per phase, and stops on RED. Existing unrelated worktree changes must be preserved; do not use the printed hard-reset rollback command in this dirty shared worktree.

## Safety and authority

- UIR-00 was approved by the user on 2026-07-11 and auto-advances on its real artifact/schema oracle.
- UIR-08 auto-completes the evidence package when all executable checks pass. It records readiness for a human release decision, never production GO or deployment approval.
- No production/UAT credentials, destructive database operations, or real PII are allowed.
- New production dependencies require the approved decision recorded by UIR-00.
- Unsupported reset/export/config controls are hidden or quarantined; implementation must not invent API or error contracts.

## Check-authoring gap

| Phase | Gate | Oracle status |
|---|---|---|
| UIR-00 | auto | Real artifact/schema checks; user approval recorded 2026-07-11 |
| UIR-01 | auto | Build/typecheck/test/static implementation oracle |
| UIR-02 | auto | Fixture and acceptance-matrix tests |
| UIR-03 | auto | Service/scope/session tests or approved not-required disposition |
| UIR-04 | auto | API contract/auth/idempotency tests or approved not-required disposition |
| UIR-05 | auto | Primitive/browser/accessibility tests |
| UIR-06 | auto | Critical-journey and authorization-negative tests |
| UIR-07 | auto | Module regression plus ledger disposition oracle |
| UIR-08 | auto | Full automated release evidence; production release judgment remains external |

Read every prompt and check before execution. Auto gates require their executable oracle to pass; production/UAT/deployment approval remains outside this harness.
