#!/usr/bin/env bash
# PH-57A oracle: raise measured contract coverage by exposing the FR-20 full-and-final settlement (settle ->
# approve with SoD) + recovery/loan/hold reads (real, service-tested backing) as kernel routes. Checks routes
# registered + dispatched, and the ratchet advanced to >= 532 / 40.2%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g10.routes.ts"; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-57A exit-criteria (G10 FnF/recovery route exposure; coverage ratchet) =="
[ -d node_modules ] || red "node_modules absent"
for m in settleFnf approveFnfSettlement listFnfSettlements listRecoverySchedules listLoans listHolds; do
  have "$R" "$m" "route wires backing method: $m"
done
have "$T"/ph57a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph57a-*.test.cjs 'fnf-settlements' "API test exercises the FnF routes"
have "$T"/ph57a-*.test.cjs 'recovery-schedules|/loans|/holds' "API test exercises the recovery/loan/hold reads"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=532)}" && grn "coverage ratcheted up (implemented $impl >= 532)" || red "coverage did not advance ($impl < 532)"
  awk "BEGIN{exit !($pct>=40.2)}" && grn "coverage >= 40.2% ($pct%)" || red "coverage below 40.2% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-57A met' || echo 'RED - PH-57A not complete') =="; exit "$fail"
