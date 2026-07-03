#!/usr/bin/env bash
# PH-45A oracle: raise measured contract coverage by exposing the G01 Aadhaar reveal (4-eyes) lifecycle +
# employee legal-hold/blocking-obligation lifecycle + service-no lookup (real, service-tested backing) as
# kernel routes. Checks routes registered + dispatched, and the ratchet advanced to >= 451 / 34.1%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g01.routes.ts"; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-45A exit-criteria (G01 aadhaar/legal-hold route exposure; coverage ratchet) =="
[ -d node_modules ] || red "node_modules absent"
for m in requestReveal approveReveal getVaultByEmployee placeLegalHold releaseLegalHold registerBlockingObligation clearBlockingObligation getByServiceNo; do
  have "$R" "$m" "route wires backing method: $m"
done
have "$T"/ph45a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph45a-*.test.cjs 'request-reveal|aadhaar-reveals' "API test exercises the reveal routes"
have "$T"/ph45a-*.test.cjs 'place-legal-hold|register-obligation' "API test exercises the legal-hold routes"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=451)}" && grn "coverage ratcheted up (implemented $impl >= 451)" || red "coverage did not advance ($impl < 451)"
  awk "BEGIN{exit !($pct>=34.1)}" && grn "coverage >= 34.1% ($pct%)" || red "coverage below 34.1% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-45A met' || echo 'RED - PH-45A not complete') =="; exit "$fail"
