#!/usr/bin/env bash
# PH-46A oracle: raise measured contract coverage by exposing the FR-G10-08 loan lifecycle (instalment
# recovery + foreclosure) + Rule-3 concessional perquisite valuation + reads (real, service-tested backing)
# as kernel routes. Checks routes registered + dispatched, and the ratchet advanced to >= 456 / 34.5%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g10.routes.ts"; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-46A exit-criteria (G10 loan/perquisite route exposure; coverage ratchet) =="
[ -d node_modules ] || red "node_modules absent"
for m in recordLoanInstalment forecloseLoan listLoanRepayments listCarryforwards valuePerquisite; do
  have "$R" "$m" "route wires backing method: $m"
done
have "$T"/ph46a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph46a-*.test.cjs '/api/v1/payroll/loans' "API test exercises the loan routes"
have "$T"/ph46a-*.test.cjs 'ERR-G10-RECOVERY-NET' "API test asserts the net-floor fail-closed guard"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=456)}" && grn "coverage ratcheted up (implemented $impl >= 456)" || red "coverage did not advance ($impl < 456)"
  awk "BEGIN{exit !($pct>=34.5)}" && grn "coverage >= 34.5% ($pct%)" || red "coverage below 34.5% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-46A met' || echo 'RED - PH-46A not complete') =="; exit "$fail"
