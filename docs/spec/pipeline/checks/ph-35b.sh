#!/usr/bin/env bash
# PH-35B oracle: G01 self-service rights routes — real kernel route(s) registered + dispatched in an API test.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g13.routes.ts"; T=apps/api/test
echo "== PH-35B exit-criteria (G01 self-service rights routes) =="
[ -d node_modules ] || red "node_modules absent"
have "$R" '/api/v1/me/rights-requests' "route path registered: /api/v1/me/rights-requests"
have "$R" 'kernel.register|routes.forEach' "route uses the kernel"
have "$R" 'listDataSubjectRequests' "handler calls the backing service (listDataSubjectRequests)"
have "$T"/ph35b-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph35b-*.test.cjs '/api/v1/me/rights-requests' "API test exercises the route"
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-35B met' || echo 'RED - PH-35B not complete') =="; exit "$fail"
