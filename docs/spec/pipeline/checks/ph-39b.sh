#!/usr/bin/env bash
# PH-39B oracle (human gate): honest tranche-26 verdict — cites the tranche-25 verdict + coverage delta,
# names the coverage ratchet (397->404 / 30.5%) and the PIP/probation route exposure, remaining-gaps,
# necessary-not-sufficient, contract-op caveat, and the EXACT suite pass counts (recomputed).
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
V=docs/spec/ph-39-verdict.md
echo "== PH-39B exit-criteria (tranche-26 verdict; human gate) =="
[ -d node_modules ] || red "node_modules absent"
api_pass=""; web_pass=""
if [ -d node_modules ]; then
  API_LOG="$(mktemp)"; WEB_LOG="$(mktemp)"
  npm test >"$API_LOG" 2>&1 || red "npm test failed"
  api_pass="$(grep -E '^# pass ' "$API_LOG" | tail -1 | awk '{print $3}')"
  npm run -s web:test >"$WEB_LOG" 2>&1 || red "web test failed"
  web_pass="$(grep -E '^# pass ' "$WEB_LOG" | tail -1 | awk '{print $3}')"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
fi
must "verdict chains from tranche-25 verdict::ph-38-verdict" "$V"
must "verdict cites the coverage delta::brd-coverage-delta-20260703" "$V"
must "verdict names the coverage ratchet::404|30.5%|PIP|probation" "$V"
must "verdict carries a G08 row::G08" "$V"
must "verdict names remaining gaps::NOT_FOUND|remaining|still open|open gap" "$V"
must "verdict necessary-not-sufficient::necessary.{0,4}not sufficient" "$V"
must "verdict contract-op caveat::1,?323|contract-op|OpenAPI" "$V"
if [ -n "$api_pass" ]; then grep -qE "(^|[^0-9])${api_pass}([^0-9]|$)" "$V" && grn "verdict states api pass ($api_pass)" || red "verdict missing api pass ($api_pass)"; else red "no api pass count"; fi
if [ -n "$web_pass" ]; then grep -qE "(^|[^0-9])${web_pass}([^0-9]|$)" "$V" && grn "verdict states web pass ($web_pass)" || red "verdict missing web pass ($web_pass)"; else red "no web pass count"; fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-39B met (await HUMAN gate review)' || echo 'RED - PH-39B not complete') =="; exit "$fail"
