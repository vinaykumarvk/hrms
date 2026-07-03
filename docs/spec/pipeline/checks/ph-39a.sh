#!/usr/bin/env bash
# PH-39A oracle: raise measured contract coverage further by exposing the APAR PIP lifecycle +
# probation-confirmation + report-period/goal-snapshot reads (all real, service-tested backing) as
# kernel routes. Checks the routes are registered + dispatched, and the ratchet advanced to >= 404 / 30.5%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g08.routes.ts"; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-39A exit-criteria (APAR PIP/probation route exposure; coverage ratchet) =="
[ -d node_modules ] || red "node_modules absent"
for m in createPip updatePipMilestone closePip openProbationConfirmation decideProbation listReportPeriods listGoalSnapshots; do
  have "$R" "$m" "route wires backing method: $m"
done
have "$T"/ph39a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph39a-*.test.cjs '/api/v1/appraisals/pips' "API test exercises the PIP routes"
have "$T"/ph39a-*.test.cjs 'probation-confirmations' "API test exercises the probation routes"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=404)}" && grn "coverage ratcheted up (implemented $impl >= 404)" || red "coverage did not advance ($impl < 404)"
  awk "BEGIN{exit !($pct>=30.5)}" && grn "coverage >= 30.5% ($pct%)" || red "coverage below 30.5% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-39A met' || echo 'RED - PH-39A not complete') =="; exit "$fail"
