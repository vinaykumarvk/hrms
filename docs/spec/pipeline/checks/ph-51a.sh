#!/usr/bin/env bash
# PH-51A oracle: raise measured contract coverage by exposing the G04 X.3 outbound-integration connector
# lifecycle (register -> send -> conformance; read) + leave->SR relay enqueue/dead-letter reads (real,
# service-tested backing) as kernel routes. Checks routes registered + dispatched, ratchet >= 489 / 37%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g04.routes.ts"; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-51A exit-criteria (G04 outbound/relay route exposure; coverage ratchet) =="
[ -d node_modules ] || red "node_modules absent"
for m in registerConnector 'outboundIntegration.send' runConformance getConnector enqueueApprovedLeave enqueueLeaveCancellation listDeadLetters; do
  have "$R" "$m" "route wires backing method: $m"
done
have "$T"/ph51a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph51a-*.test.cjs 'integration/connectors' "API test exercises the connector routes"
have "$T"/ph51a-*.test.cjs 'enqueue-approved|dead-letters' "API test exercises the relay routes"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=489)}" && grn "coverage ratcheted up (implemented $impl >= 489)" || red "coverage did not advance ($impl < 489)"
  awk "BEGIN{exit !($pct>=37)}" && grn "coverage >= 37% ($pct%)" || red "coverage below 37% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-51A met' || echo 'RED - PH-51A not complete') =="; exit "$fail"
