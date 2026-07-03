#!/usr/bin/env bash
# PH-54A oracle: raise measured contract coverage by exposing G05 transfer/counselling reads (vacancy
# positions, reservations, preferences, mutual orders, charge-handovers, relieving/joining reports) as
# kernel routes over tested backing. Checks routes registered + dispatched, ratchet >= 513 / 38.8%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g05.routes.ts"; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-54A exit-criteria (G05 transfer/counselling read route exposure; coverage ratchet) =="
[ -d node_modules ] || red "node_modules absent"
for m in getVacancyPosition getReservation listReservations listPreferences getMutualOrder listMutualOrders listChargeHandovers listRelievingOrders listJoiningReports; do
  have "$R" "$m" "route wires backing method: $m"
done
have "$T"/ph54a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph54a-*.test.cjs 'reservations|mutual-orders' "API test exercises the list-read routes"
have "$T"/ph54a-*.test.cjs 'vacancy-positions/nope' "API test exercises the get-by-id 404 guard"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=513)}" && grn "coverage ratcheted up (implemented $impl >= 513)" || red "coverage did not advance ($impl < 513)"
  awk "BEGIN{exit !($pct>=38.8)}" && grn "coverage >= 38.8% ($pct%)" || red "coverage below 38.8% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-54A met' || echo 'RED - PH-54A not complete') =="; exit "$fail"
