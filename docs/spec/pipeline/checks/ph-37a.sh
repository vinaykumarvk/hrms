#!/usr/bin/env bash
# PH-37A oracle: contract-coverage gate. Independently recomputes coverage via tools/contract-coverage.mjs,
# ties the implemented total to the live kernel route registry, checks the baseline report carries the
# current numbers, and enforces the ratchet floor (coverage may only go up). Turns the standing "1,306
# OpenAPI ops" caveat into a tracked, executable metric.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
REPORT=docs/reviews/contract-coverage-20260703.md
TOOL=tools/contract-coverage.mjs
FLOOR_ROUTES=564; FLOOR_PCT=42.6
echo "== PH-37A exit-criteria (contract-coverage gate) =="
[ -d node_modules ] || red "node_modules absent"
[ -f "$TOOL" ] && grn "coverage tool present" || red "coverage tool missing"
[ -f "$REPORT" ] && grn "baseline report present" || red "baseline report missing"
have apps/api/test/ph37a-*.test.cjs 'listRoutes|contract-coverage' "self-consistency test present"

if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  REC="$(node "$TOOL" --json 2>/dev/null)"
  if [ -z "$REC" ]; then red "coverage tool produced no output"; else
    impl="$(printf '%s' "$REC" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
    total="$(printf '%s' "$REC" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).contractTotal)})")"
    pct="$(printf '%s' "$REC" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
    # Tie to the live registry (independent recomputation).
    live="$(node -e "const {createFoundationApi,createFoundationServices}=require('./dist/apps/api/src'); console.log(createFoundationApi(createFoundationServices()).listRoutes().length)")"
    [ "$impl" = "$live" ] && grn "coverage implemented total ($impl) ties to live registry" || red "coverage implemented ($impl) != live registry ($live)"
    # Ratchet floor — coverage may only go up.
    awk "BEGIN{exit !($impl>=$FLOOR_ROUTES)}" && grn "implemented routes >= floor ($impl >= $FLOOR_ROUTES)" || red "implemented routes below floor ($impl < $FLOOR_ROUTES)"
    awk "BEGIN{exit !($pct>=$FLOOR_PCT)}" && grn "coverage >= floor ($pct% >= $FLOOR_PCT%)" || red "coverage below floor ($pct% < $FLOOR_PCT%)"
    # Report must carry the current numbers (staleness guard).
    have "$REPORT" "(^|[^0-9])${impl}([^0-9]|\$)" "report states current implemented total ($impl)"
    have "$REPORT" "(^|[^0-9])${total}([^0-9]|\$)" "report states current contract total ($total)"
  fi
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-37A met' || echo 'RED - PH-37A not complete') =="; exit "$fail"
