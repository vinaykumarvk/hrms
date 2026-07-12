#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"
echo "== UIR-06 critical journey oracle =="
run node --test apps/web/test/ui-remediation-critical.test.cjs
run npm run web:typecheck
run npm run web:test
run npm run web:test:e2e -- --project=chromium --grep @critical
finish
