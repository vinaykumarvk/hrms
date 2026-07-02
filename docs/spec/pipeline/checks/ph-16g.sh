#!/usr/bin/env bash
# PH-16G oracle (human gate): honest tranche-3 verdict — cites the 2026-07-03 coverage delta, carries a
# per-module row for every touched module (G01, G02, G04, G05, G07, G08, G10, G11), names remaining gaps,
# states the necessary-not-sufficient rule, and quotes the EXACT suite pass counts (the oracle recomputes both
# counts itself and compares). All four suites must be green underneath. GREEN here still requires HUMAN
# review before any approval token.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
V=docs/spec/ph-16-verdict.md

echo "== PH-16G exit-criteria (tranche-3 verdict + coverage delta; human gate) =="

[ -d node_modules ] || red "node_modules absent — toolchain oracle cannot run; refusing GREEN without it"

# 1) suites — run once, keep output for the count tie-out; RED on any failure
api_pass=""; web_pass=""
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "api typecheck green" || red "api typecheck failed"
  API_LOG="$(mktemp)"
  if npm test >"$API_LOG" 2>&1; then grn "api suite green"; else red "npm test failed"; fi
  api_pass="$(grep -E '^# pass ' "$API_LOG" | tail -1 | awk '{print $3}')"
  rm -f "$API_LOG"
  npm run -s web:typecheck >/dev/null 2>&1 && grn "web typecheck green" || red "web typecheck failed"
  WEB_LOG="$(mktemp)"
  if npm run -s web:test >"$WEB_LOG" 2>&1; then grn "web suite green"; else red "web tests failed"; fi
  web_pass="$(grep -E '^# pass ' "$WEB_LOG" | tail -1 | awk '{print $3}')"
  rm -f "$WEB_LOG"
fi

# 2) honest verdict content (content-checked, not existence-checked)
must "verdict cites the tranche baseline delta::brd-coverage-delta-20260703" "$V"
must "verdict chains from the tranche-2 verdict::ph-15-verdict" "$V"
for m in G01 G02 G04 G05 G07 G08 G10 G11; do
  must "verdict carries a $m row::$m" "$V"
done
must "verdict names remaining gaps (no 100% claim)::NOT_FOUND|remaining|still open|open gap" "$V"
must "verdict carries the necessary-not-sufficient statement::necessary.{0,4}not sufficient" "$V"
must "verdict notes contract-op coverage caveat::1,?306|contract-op|OpenAPI" "$V"

# 3) oracle-computed suite counts must appear verbatim in the verdict
if [ -n "$api_pass" ]; then
  if grep -qE "(^|[^0-9])${api_pass}([^0-9]|$)" "$V" 2>/dev/null; then
    grn "verdict states the oracle-computed api pass count ($api_pass)"
  else red "verdict does not state the exact api suite pass count ($api_pass)"; fi
else red "could not compute api pass count from the suite output"; fi
if [ -n "$web_pass" ]; then
  if grep -qE "(^|[^0-9])${web_pass}([^0-9]|$)" "$V" 2>/dev/null; then
    grn "verdict states the oracle-computed web pass count ($web_pass)"
  else red "verdict does not state the exact web suite pass count ($web_pass)"; fi
else red "could not compute web pass count from the suite output"; fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-16G met (await HUMAN gate review)' || echo 'RED - PH-16G not complete') =="
exit "$fail"
