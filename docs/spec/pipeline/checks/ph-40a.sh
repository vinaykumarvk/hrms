#!/usr/bin/env bash
# PH-40A oracle: raise measured contract coverage by exposing continuous-feedback (check-in + reads),
# 360-feedback (rate/release/read), and signature reads — all real, service-tested G08 backing — as
# kernel routes. Checks routes registered + dispatched, and the ratchet advanced to >= 411 / 31.1%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g08.routes.ts"; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-40A exit-criteria (feedback/signature route exposure; coverage ratchet) =="
[ -d node_modules ] || red "node_modules absent"
for m in recordCheckIn listFeedback listCheckIns submitRating release360 get360 listSignatures; do
  have "$R" "$m" "route wires backing method: $m"
done
have "$T"/ph40a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph40a-*.test.cjs '360-feedback' "API test exercises the 360-feedback routes"
have "$T"/ph40a-*.test.cjs 'continuous-feedback' "API test exercises the continuous-feedback routes"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=411)}" && grn "coverage ratcheted up (implemented $impl >= 411)" || red "coverage did not advance ($impl < 411)"
  awk "BEGIN{exit !($pct>=31.1)}" && grn "coverage >= 31.1% ($pct%)" || red "coverage below 31.1% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-40A met' || echo 'RED - PH-40A not complete') =="; exit "$fail"
