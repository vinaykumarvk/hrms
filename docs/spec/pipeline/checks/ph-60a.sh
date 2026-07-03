#!/usr/bin/env bash
# PH-60A oracle: raise measured contract coverage by exposing G03 attendance-policy config + leave-ledger/
# attendance/comp-off-balance reads (real, service-tested backing) as kernel routes. Checks routes
# registered + dispatched, and the ratchet advanced to >= 547 / 41.3%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g03.routes.ts"; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-60A exit-criteria (G03 attendance-policy route exposure; coverage ratchet) =="
[ -d node_modules ] || red "node_modules absent"
for m in configureAttendancePolicy listLedger listAttendance getCompOffBalance; do
  have "$R" "$m" "route wires backing method: $m"
done
have "$T"/ph60a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph60a-*.test.cjs 'attendance/policy' "API test exercises the policy config route"
have "$T"/ph60a-*.test.cjs 'leave/ledger|comp-off-balance' "API test exercises the reads"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=547)}" && grn "coverage ratcheted up (implemented $impl >= 547)" || red "coverage did not advance ($impl < 547)"
  awk "BEGIN{exit !($pct>=41.3)}" && grn "coverage >= 41.3% ($pct%)" || red "coverage below 41.3% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-60A met' || echo 'RED - PH-60A not complete') =="; exit "$fail"
