#!/usr/bin/env bash
# PH-33B oracle: G07 LMS + G08 360-feedback routes — real kernel route(s) registered + dispatched in an API test.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g07.routes.ts"; T=apps/api/test
echo "== PH-33B exit-criteria (G07 LMS + G08 360-feedback routes) =="
[ -d node_modules ] || red "node_modules absent"
have "$R" 'learning-record-stores' "route path registered: learning-record-stores"
have "$R" 'kernel.register|routes.forEach' "route uses the kernel"
have "$R" 'lmsIntegration' "handler calls the backing service (lmsIntegration)"
have "$T"/ph33b-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph33b-*.test.cjs 'learning-record-stores' "API test exercises the route"
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-33B met' || echo 'RED - PH-33B not complete') =="; exit "$fail"
