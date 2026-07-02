#!/usr/bin/env bash
# PH-10C oracle: hardening, NFR, backup/restore, and migration dry-run evidence.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-10C exit-criteria (hardening + migration evidence) =="

need_file apps/api/src/migration/ph10MigrationDryRun.ts 2500
need_file apps/api/test/ph10-hardening-migration.test.cjs 2500
need_file docs/release/security-hardening-evidence.md 1500
need_file docs/release/nfr-validation.md 1500
need_file ops/backup-restore-drill.md 1200

for marker in NFR_API_P95 DASHBOARD_LCP BACKUP_RESTORE_DRILL SECURITY_SCAN_NO_SECRETS MIGRATION_DRY_RUN RECONCILIATION_CERTIFIED ACCESSIBILITY_AA; do
  rg -q "$marker" apps/api/src/migration apps/api/test/ph10-hardening-migration.test.cjs docs/release ops && grn "hardening marker: $marker" || red "missing hardening marker: $marker"
done

if npm run build && node --test apps/api/test/ph10-hardening-migration.test.cjs; then
  grn "PH-10C hardening/migration tests passed"
else
  red "PH-10C hardening/migration tests failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-10C met' || echo 'RED - PH-10C not complete') =="
exit "$fail"
