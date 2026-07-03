#!/usr/bin/env bash
# PH-52A oracle: raise measured contract coverage by exposing the G06 FR-015 sanctioned-posts establishment
# lifecycle (register/revise with maker!=checker; reconcile with STRENGTH_INCONSISTENT guard; reads + vacancy)
# as kernel routes. Checks routes registered + dispatched, and the ratchet advanced to >= 495 / 37.4%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g06.routes.ts"; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-52A exit-criteria (G06 sanctioned-post route exposure; coverage ratchet) =="
[ -d node_modules ] || red "node_modules absent"
for m in registerSanctionedPost reviseSanctionedPost reconcileSanctionedPost getSanctionedPost listSanctionedPosts getVacancyComputation; do
  have "$R" "$m" "route wires backing method: $m"
done
have "$T"/ph52a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph52a-*.test.cjs 'sanctioned-posts' "API test exercises the sanctioned-post routes"
have "$T"/ph52a-*.test.cjs 'STRENGTH_INCONSISTENT' "API test asserts the strength fail-closed guard"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=495)}" && grn "coverage ratcheted up (implemented $impl >= 495)" || red "coverage did not advance ($impl < 495)"
  awk "BEGIN{exit !($pct>=37.4)}" && grn "coverage >= 37.4% ($pct%)" || red "coverage below 37.4% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-52A met' || echo 'RED - PH-52A not complete') =="; exit "$fail"
