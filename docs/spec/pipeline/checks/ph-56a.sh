#!/usr/bin/env bash
# PH-56A oracle: raise measured contract coverage by exposing the FR-16 payroll engine-run lifecycle
# (create -> snapshot -> compute -> approve (SoD) -> lock) + reads (real, service-tested backing) as kernel
# routes. Checks routes registered + dispatched, and the ratchet advanced to >= 526 / 39.8%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g10.routes.ts"; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-56A exit-criteria (G10 engine-run route exposure; coverage ratchet) =="
[ -d node_modules ] || red "node_modules absent"
for m in createEngineRun snapshotRunInputs computeEngineRun approveEngineRun lockEngineRun getEngineRun listRunPayslips; do
  have "$R" "$m" "route wires backing method: $m"
done
have "$T"/ph56a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph56a-*.test.cjs 'engine-runs' "API test exercises the engine-run routes"
have "$T"/ph56a-*.test.cjs ':approve' "API test exercises the SoD approval step"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=526)}" && grn "coverage ratcheted up (implemented $impl >= 526)" || red "coverage did not advance ($impl < 526)"
  awk "BEGIN{exit !($pct>=39.8)}" && grn "coverage >= 39.8% ($pct%)" || red "coverage below 39.8% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-56A met' || echo 'RED - PH-56A not complete') =="; exit "$fail"
