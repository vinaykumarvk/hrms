#!/usr/bin/env bash
# PH-61A oracle: raise measured contract coverage by exposing G12 SR admissibility/integrity reads
# (subscriptions, attestations) + G13 OCR index management (index-from-payload, list) as kernel routes over
# tested backing. Checks routes registered + dispatched, and the ratchet advanced to >= 552 / 41.7%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
G12="apps/api/src/routes/g12.routes.ts"; G13="apps/api/src/routes/g13.routes.ts"; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-61A exit-criteria (G12/G13 admissibility/OCR route exposure; coverage ratchet) =="
[ -d node_modules ] || red "node_modules absent"
for m in listSubscriptions listAttestations getAttestation; do have "$G12" "$m" "G12 route wires: $m"; done
for m in indexDocumentFromPayload listIndex; do have "$G13" "$m" "G13 route wires: $m"; done
have "$T"/ph61a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph61a-*.test.cjs 'subscriptions|attestations' "API test exercises the G12 reads"
have "$T"/ph61a-*.test.cjs 'ocr-index' "API test exercises the G13 OCR index routes"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=552)}" && grn "coverage ratcheted up (implemented $impl >= 552)" || red "coverage did not advance ($impl < 552)"
  awk "BEGIN{exit !($pct>=41.7)}" && grn "coverage >= 41.7% ($pct%)" || red "coverage below 41.7% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-61A met' || echo 'RED - PH-61A not complete') =="; exit "$fail"
