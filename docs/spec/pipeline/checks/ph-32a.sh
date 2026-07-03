#!/usr/bin/env bash
# PH-32A oracle: G06 career-path + correction routes — real kernel route(s) registered + dispatched in an API test.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g06.routes.ts"; T=apps/api/test
echo "== PH-32A exit-criteria (G06 career-path + correction routes) =="
[ -d node_modules ] || red "node_modules absent"
have "$R" 'career-paths' "route path registered: career-paths"
have "$R" 'kernel.register|routes.forEach' "route uses the kernel"
have "$R" 'careerSuccession' "handler calls the backing service (careerSuccession)"
have "$T"/ph32a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph32a-*.test.cjs 'career-paths' "API test exercises the route"
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-32A met' || echo 'RED - PH-32A not complete') =="; exit "$fail"
