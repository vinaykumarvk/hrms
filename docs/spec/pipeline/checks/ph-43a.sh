#!/usr/bin/env bash
# PH-43A oracle: raise measured contract coverage by exposing G14 analytics-engine reads + KPI target-
# setting + predictive-score reads (real, service-tested backing) as kernel routes. Checks routes
# registered + dispatched, and the ratchet advanced to >= 436 / 33%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g14.routes.ts"; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-43A exit-criteria (G14 analytics-engine route exposure; coverage ratchet) =="
[ -d node_modules ] || red "node_modules absent"
for m in kpiSeries listDatamarts setKpiTarget drillCohort listScopePolicies listScores; do
  have "$R" "$m" "route wires backing method: $m"
done
have "$T"/ph43a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph43a-*.test.cjs '/api/v1/analytics/kpis' "API test exercises the KPI routes"
have "$T"/ph43a-*.test.cjs 'attrition-scores|datamarts|scope-policies' "API test exercises the read routes"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=436)}" && grn "coverage ratcheted up (implemented $impl >= 436)" || red "coverage did not advance ($impl < 436)"
  awk "BEGIN{exit !($pct>=33)}" && grn "coverage >= 33% ($pct%)" || red "coverage below 33% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-43A met' || echo 'RED - PH-43A not complete') =="; exit "$fail"
