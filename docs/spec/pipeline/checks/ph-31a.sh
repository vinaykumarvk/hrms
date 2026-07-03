#!/usr/bin/env bash
# PH-31A oracle: G02 retro-impact route — real kernel route(s) registered + dispatched in an API test.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g02.routes.ts"; T=apps/api/test
echo "== PH-31A exit-criteria (G02 retro-impact route) =="
[ -d node_modules ] || red "node_modules absent"
have "$R" 'retro-impact' "route path registered: retro-impact"
have "$R" 'kernel.register|routes.forEach' "route uses the kernel"
have "$R" 'retroImpact' "handler calls the backing service (retroImpact)"
have "$T"/ph31a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph31a-*.test.cjs 'retro-impact' "API test exercises the route"
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-31A met' || echo 'RED - PH-31A not complete') =="; exit "$fail"
