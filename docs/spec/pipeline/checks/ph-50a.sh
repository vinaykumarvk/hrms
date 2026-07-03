#!/usr/bin/env bash
# PH-50A oracle: raise measured contract coverage by exposing the G03 leave year-close simulate + encashment
# + mass-leave + punch-review/exception reads (real, service-tested backing) as kernel routes. Checks routes
# registered + dispatched, and the ratchet advanced to >= 482 / 36.4%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g03.routes.ts"; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-50A exit-criteria (G03 leave/attendance route exposure; coverage ratchet) =="
[ -d node_modules ] || red "node_modules absent"
for m in simulateYearClose encashLeave listEncashments applyMassLeave resolveReview getReview listExceptions; do
  have "$R" "$m" "route wires backing method: $m"
done
have "$T"/ph50a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph50a-*.test.cjs 'year-close:simulate|encashments' "API test exercises the leave routes"
have "$T"/ph50a-*.test.cjs 'ENCASHMENT_CAP_EXCEEDED' "API test asserts the encashment-cap guard"
have "$T"/ph50a-*.test.cjs 'mass-leave' "API test exercises the mass-leave route"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=482)}" && grn "coverage ratcheted up (implemented $impl >= 482)" || red "coverage did not advance ($impl < 482)"
  awk "BEGIN{exit !($pct>=36.4)}" && grn "coverage >= 36.4% ($pct%)" || red "coverage below 36.4% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-50A met' || echo 'RED - PH-50A not complete') =="; exit "$fail"
