#!/usr/bin/env bash
# PH-47A oracle: raise measured contract coverage by exposing the G11 PDA go-live lifecycle (certify sandbox
# -> activate; read) + grievance close + pensioner bank-account verification (real, service-tested backing)
# as kernel routes. Checks routes registered + dispatched, and the ratchet advanced to >= 462 / 34.9%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g11.routes.ts"; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-47A exit-criteria (G11 PDA/verification route exposure; coverage ratchet) =="
[ -d node_modules ] || red "node_modules absent"
for m in certifyPdaSandbox activatePda getPda closeGrievance recordAccountVerification listVerifications; do
  have "$R" "$m" "route wires backing method: $m"
done
have "$T"/ph47a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph47a-*.test.cjs 'certify-sandbox|:activate' "API test exercises the PDA routes"
have "$T"/ph47a-*.test.cjs 'account-verifications' "API test exercises the verification routes"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=462)}" && grn "coverage ratcheted up (implemented $impl >= 462)" || red "coverage did not advance ($impl < 462)"
  awk "BEGIN{exit !($pct>=34.9)}" && grn "coverage >= 34.9% ($pct%)" || red "coverage below 34.9% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-47A met' || echo 'RED - PH-47A not complete') =="; exit "$fail"
