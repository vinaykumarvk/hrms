#!/usr/bin/env bash
# PH-58A oracle: raise measured contract coverage by exposing G11 pension disbursement (transmit + list) +
# pensioner lifecycle reads (life certificates, pensioner-by-case) as kernel routes over tested backing.
# Checks routes registered + dispatched, and the ratchet advanced to >= 536 / 40.5%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g11.routes.ts"; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-58A exit-criteria (G11 disbursement route exposure; coverage ratchet) =="
[ -d node_modules ] || red "node_modules absent"
for m in 'pensionDisbursement.disburse' listDisbursements listLifeCertificates findPensionerByCase; do
  have "$R" "$m" "route wires backing method: $m"
done
have "$T"/ph58a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph58a-*.test.cjs 'disbursements' "API test exercises the disbursement routes"
have "$T"/ph58a-*.test.cjs 'life-certificates|/pensioner' "API test exercises the lifecycle reads"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=536)}" && grn "coverage ratcheted up (implemented $impl >= 536)" || red "coverage did not advance ($impl < 536)"
  awk "BEGIN{exit !($pct>=40.5)}" && grn "coverage >= 40.5% ($pct%)" || red "coverage below 40.5% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-58A met' || echo 'RED - PH-58A not complete') =="; exit "$fail"
