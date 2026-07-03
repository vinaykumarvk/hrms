#!/usr/bin/env bash
# PH-28C oracle: G05 counselling session route — a real kernel route registered and dispatched in an API test.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g05.routes.ts"; T=apps/api/test
echo "== PH-28C exit-criteria (G05 counselling session route) =="
[ -d node_modules ] || red "node_modules absent"
have "$R" 'counselling' "route path registered: counselling"
have "$R" 'kernel.register' "route uses kernel.register"
have "$R" 'getCounsellingSession' "handler calls the backing service (getCounsellingSession)"
have "$T"/ph28c-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph28c-*.test.cjs 'counselling' "API test exercises the route"
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-28C met' || echo 'RED - PH-28C not complete') =="; exit "$fail"
