#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"
echo "== UIR-08 integration release-evidence oracle =="
for f in docs/evidence/ui-remediation/final-command-log.md docs/evidence/ui-remediation/accessibility-summary.md docs/evidence/ui-remediation/keyboard-traversal.md docs/evidence/ui-remediation/authorization-negative-results.md docs/release/ui-remediation-readiness.md; do need_file "$f" 300; done
[ -d docs/evidence/ui-remediation/screenshot-matrix ] && [ "$(find docs/evidence/ui-remediation/screenshot-matrix -type f | wc -l)" -ge 3 ] && grn "screenshot matrix" || red "screenshot matrix incomplete"
run npm run check
run npm run web:check
run npm run web:test:e2e -- --project=chromium
run bash docs/spec/pipeline/checks/ph-05e.sh
run npm audit --audit-level=low
run bash -c '! rg -F "Welcome@123" dist/apps/web && ! rg -F '"'"'alg:"none"'"'"' dist/apps/web'
rg -n 'Blocking Gates Evaluated:[[:space:]]*16/16' docs/release/ui-remediation-readiness.md >/dev/null && grn "16/16 blocking gates evaluated" || red "blocking gate evidence incomplete"
finish
