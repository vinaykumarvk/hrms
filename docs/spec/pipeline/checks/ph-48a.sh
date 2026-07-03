#!/usr/bin/env bash
# PH-48A oracle: raise measured contract coverage by exposing the G12 SR-ledger chain reads + RFC-3161
# timestamp / offline-bundle verification (real, service-tested backing) as kernel routes. Checks routes
# registered + dispatched, and the ratchet advanced to >= 469 / 35.4%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g12.routes.ts"; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-48A exit-criteria (G12 chain/verify route exposure; coverage ratchet) =="
[ -d node_modules ] || red "node_modules absent"
for m in getEntryChain getStatusChain getStatusEvents listChainEmployees listFeedEvents verifyTimestamp verifyBundle; do
  have "$R" "$m" "route wires backing method: $m"
done
have "$T"/ph48a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph48a-*.test.cjs 'entry-chain|chain-employees' "API test exercises the chain-read routes"
have "$T"/ph48a-*.test.cjs 'timestamp:verify|verification-bundle:verify' "API test exercises the verify routes"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=469)}" && grn "coverage ratcheted up (implemented $impl >= 469)" || red "coverage did not advance ($impl < 469)"
  awk "BEGIN{exit !($pct>=35.4)}" && grn "coverage >= 35.4% ($pct%)" || red "coverage below 35.4% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-48A met' || echo 'RED - PH-48A not complete') =="; exit "$fail"
