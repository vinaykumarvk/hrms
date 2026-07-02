/goal
  objective: Complete PH-10C - implement migration dry-run and enterprise hardening evidence.
  context:
    - docs/spec/ph-10-analytics-hardening-release-plan.md
    - apps/api/src/migration/**
    - docs/release/**
    - ops/**
  constraints:
    - Do not perform destructive migration or production restore.
    - Security and NFR evidence must be explicit about sandbox/non-production scope.
    - Do not add new production dependencies.
  freedom:
    - Add migration dry-run helpers, hardening evidence docs, ops drills, and tests.
  evidence_required:
    - apps/api/src/migration/ph10MigrationDryRun.ts
    - docs/release/security-hardening-evidence.md
    - docs/release/nfr-validation.md
    - ops/backup-restore-drill.md
    - apps/api/test/ph10-hardening-migration.test.cjs
    - `bash docs/spec/pipeline/checks/ph-10c.sh` GREEN
  escalate_when:
    - A required evidence item needs live production credentials or destructive data operations.
