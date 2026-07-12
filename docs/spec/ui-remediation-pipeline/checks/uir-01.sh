#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"
echo "== UIR-01 baseline repair oracle =="
need_file apps/web/src/app/ErrorBoundary.tsx 300
need_file apps/web/test/ui-remediation-baseline.test.cjs 300
need_file docs/evidence/ui-remediation/baseline-command-log.md 300
rg -n '\b100vh\b' apps/web/src --glob '*.css' --glob '*.tsx' >/dev/null && red "100vh remains" || grn "no 100vh"
rg -n 'prefers-reduced-motion' apps/web/src --glob '*.css' >/dev/null && grn "reduced motion" || red "missing reduced motion"
run npm run web:typecheck
run npm run web:build
run npm run web:test
run bash docs/spec/pipeline/checks/ph-05e.sh
finish
