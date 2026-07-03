#!/usr/bin/env bash
# PH-36A oracle: G09 POSH conciliation engine + route (FR-G09-023 BR-2) — real kernel route
# registered + dispatched in an API test; BR-2 (no monetary settlement) enforced by the engine.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g09.routes.ts"; S="apps/api/src/modules/g09/disciplinaryService.ts"; T=apps/api/test
echo "== PH-36A exit-criteria (G09 POSH conciliation engine + route) =="
[ -d node_modules ] || red "node_modules absent"
have "$R" '/api/v1/disciplinary/cases/\{id\}:conciliation' "route path registered: :conciliation"
have "$R" 'routes.forEach' "route uses the kernel"
have "$R" 'recordConciliation' "handler calls the backing engine (recordConciliation)"
have "$S" 'recordConciliation' "engine method recordConciliation present"
have "$S" 'ERR-G09-CONCILIATION-MONETARY' "BR-2 monetary-settlement guard present"
have "$T"/ph36a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph36a-*.test.cjs ':conciliation' "API test exercises the route"
have "$T"/ph36a-*.test.cjs 'ERR-G09-CONCILIATION-MONETARY' "API test asserts the BR-2 rejection"
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-36A met' || echo 'RED - PH-36A not complete') =="; exit "$fail"
