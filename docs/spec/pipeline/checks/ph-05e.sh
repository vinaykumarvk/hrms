#!/usr/bin/env bash
# PH-05E oracle (gate: human): UI conformance and review packet — asserts REAL coverage.
# Re-baselined 2026-07-02 after docs/reviews/brd-coverage-audit-20260702.md: the previous check
# accepted a marker-word verdict while every module UI was a read-only metric card. This oracle
# independently counts which of the 14 module surfaces implement the canonical loading/error/
# empty branches, requires docs/spec/ph-05-verdict.md to state the SAME count (honesty check),
# and runs the full web+API toolchain RED-on-fail. bash 3.2 / BSD grep compatible.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
echo "== PH-05E exit-criteria (UI conformance + review packet) =="

# --- 1. Canonical state branches in every shipped module surface -----------------------------------
okc=0
for m in g01 g02 g03 g04 g05 g06 g07 g08 g09 g10 g11 g12 g13 g14; do
  d="apps/web/src/modules/$m"
  missing=""
  for state in loading error empty; do
    grep -rqi "$state" "$d" 2>/dev/null || missing="$missing $state"
  done
  if [ -z "$missing" ]; then okc=$((okc+1)); grn "module $m implements loading/error/empty branches"
  else red "module $m missing state branch(es):$missing"; fi
done
for state in loading error empty; do
  grep -rqi "$state" apps/web/src/workflow 2>/dev/null && grn "workflow inbox implements state: $state" || red "workflow inbox missing state: $state"
done

# --- 2. Honest verdict packet: numbers must match the oracle's own count ----------------------------
v=docs/spec/ph-05-verdict.md
if [ -s "$v" ] && [ "$(wc -c < "$v")" -ge 1500 ]; then grn "verdict packet present: $v"
else red "missing/too-small verdict packet: $v"; fi
if grep -q "state_coverage: ${okc}/14" "$v" 2>/dev/null; then
  grn "verdict states the oracle-computed state coverage (${okc}/14)"
else red "verdict does not state 'state_coverage: ${okc}/14' — run this check and record its numbers"; fi
for mod in G01 G02 G03 G04 G05 G06 G07 G08 G09 G10 G11 G12 G13 G14; do
  grep -q "$mod" "$v" 2>/dev/null && grn "verdict covers $mod" || red "verdict missing module row: $mod"
done
grep -qiE 'gap|not implemented|missing|read-only' "$v" 2>/dev/null && grn "verdict names remaining gaps" || red "verdict does not name remaining gaps"
grep -qiE 'accessib|keyboard|focus|WCAG' "$v" 2>/dev/null && grn "verdict records accessibility status" || red "verdict missing accessibility status"

# --- 3. FAIL-CLOSED negatives across the whole web surface ------------------------------------------
if grep -rn 'fixtureHrmsClient\|createFixtureHrmsClient' apps/web/src 2>/dev/null | grep -v 'src/api/' | grep -q .; then
  red "fixture client consumed in production src"; else grn "fixture client confined to src/api/tests"; fi
if grep -rn 'localhost' apps/web/src 2>/dev/null | grep -q .; then
  red "hardcoded localhost in web src"; else grn "no hardcoded localhost"; fi
if grep -rn 'console\.log' apps/web/src 2>/dev/null | grep -q .; then
  red "console.log in web src"; else grn "no console.log in web src"; fi
if grep -rn 'permissions={\["\*"\]}' apps/web/src 2>/dev/null | grep -v '/test/' | grep -q .; then
  red 'wildcard permissions={["*"]} grant still hardcoded'; else grn "no hardcoded wildcard permission grant"; fi

# --- 4. Conformance test exists AND the full toolchain is green --------------------------------------
t=apps/web/test/ph05-ui-conformance.test.cjs
if [ -s "$t" ]; then
  grn "UI conformance test present: $t"
  grep -qiE 'loading|error|empty' "$t" && grn "conformance test asserts canonical states" || red "conformance test does not assert canonical states"
else red "missing UI conformance test: $t"; fi
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm typecheck passes" || red "npm typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test passes (API suite)" || red "npm test failed"
  npm run -s web:typecheck >/dev/null 2>&1 && grn "npm web:typecheck passes" || red "npm web:typecheck failed"
  npm run -s web:test >/dev/null 2>&1 && grn "npm web:test passes" || red "npm web:test failed"
else
  red "node_modules absent — PH-05E freeze requires green typecheck+test on both apps"
fi

echo "== $([ $fail -eq 0 ] && echo 'GREEN — PH-05E met (human gate: review the packet)' || echo 'RED — PH-05E not complete') =="; exit $fail
