#!/usr/bin/env bash
# PH-33C oracle: G11 grievances + G14 fairness routes — real kernel route(s) registered + dispatched in an API test.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g11.routes.ts"; T=apps/api/test
echo "== PH-33C exit-criteria (G11 grievances + G14 fairness routes) =="
[ -d node_modules ] || red "node_modules absent"
have "$R" 'grievances' "route path registered: grievances"
have "$R" 'kernel.register|routes.forEach' "route uses the kernel"
have "$R" 'pensionTreasury' "handler calls the backing service (pensionTreasury)"
have "$T"/ph33c-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph33c-*.test.cjs 'grievances' "API test exercises the route"
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-33C met' || echo 'RED - PH-33C not complete') =="; exit "$fail"
