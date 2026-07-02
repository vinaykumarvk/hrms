#!/usr/bin/env bash
# PH-08B oracle (re-baselined 2026-07-02 after docs/reviews/brd-coverage-audit-20260702.md):
# G05 full transfer administration — charge handovers incl. under-protest, distance-band joining time,
# deputation tenure caps + repatriation, served-on/deemed service gate, quarter penal-rent flip.
# Asserts BRD-named entities/codes as real thrown values plus a green suite. No marker-string greps.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
srcq(){ _l="$1"; _p="$2"; shift 2; if grep -rqiE "$_p" "$@" 2>/dev/null; then grn "$_l"; else red "$_l (pattern: $_p)"; fi; }
codeq(){ _l="$1"; _p="$2"; shift 2; if grep -rqE "$_p" "$@" 2>/dev/null; then grn "$_l"; else red "$_l (pattern: $_p)"; fi; }

G05MOD=apps/api/src/modules/g05
G05RT=apps/api/src/routes
T=apps/api/test/ph08b-g05-administration.test.cjs
echo "== PH-08B exit-criteria (G05 full transfer administration) =="

[ -d node_modules ] || red "node_modules absent — typecheck/test oracle cannot run (install deps first)"

# 1) BRD-named entities / behaviours in the G05 surface
ENTITIES=(
  'charge handover entity::charge.?handover'
  'joining-time by distance band::distance.?band'
  'joining time entitlement::joining.?time'
  'deputation records::deputation'
  'deputation repatriation path::repatriat'
  'order acknowledgement / served-on::acknowledg'
  'quarter retention::quarter'
  'penal rent flip::penal'
)
for item in "${ENTITIES[@]}"; do
  srcq "src: ${item%%::*}" "${item##*::}" "$G05MOD" "$G05RT"
done

# 2) BRD status + domain error codes as string literals in the G05 surface (case-sensitive)
CODES=(
  'UNDER_PROTEST'
  'DEEMED_SERVED'
  'ERR-G05-HANDOVER-DISPUTED'
  'ERR-G05-DEPUTATION-CAP'
  'ERR-G05-NOT-SERVED'
  'ERR-G05-QUARTER-OVERSTAY'
)
for c in "${CODES[@]}"; do
  codeq "src carries code literal $c" "\"$c\"" "$G05MOD" "$G05RT"
done

# 3) behavioural tests — named suite that `npm test` must run green
if [ -s "$T" ]; then grn "test file: $T"; else red "missing test file: $T"; fi
TESTS=(
  'handover under protest exercised::UNDER_PROTEST'
  'distance-band joining-time computation::distance.?band'
  'deemed service reaches DEEMED_SERVED::DEEMED_SERVED'
  'quarter penal flip exercised::penal'
  'deputation lifecycle exercised::deputation'
)
for item in "${TESTS[@]}"; do
  srcq "test: ${item%%::*}" "${item##*::}" "$T"
done
codeq "negative: relieve/effect of unserved order rejected via error.code" 'code === "ERR-G05-NOT-SERVED"' "$T"
codeq "negative: deputation tenure cap rejected via error.code" 'code === "ERR-G05-DEPUTATION-CAP"' "$T"
grep -q 'assert\.throws' "$T" 2>/dev/null && grn "fail-closed negatives use assert.throws" || red "no assert.throws negative in $T"
if grep -q 'details\.marker' "$T" 2>/dev/null; then red "marker-string assertion regression in $T (assert error.code, not details.marker)"; else grn "no marker-string indirection in $T"; fi

# 4) strong oracle: typecheck + full API suite (RED on failure, never WARN)
if [ -d node_modules ]; then
  if npm run -s typecheck >/tmp/ph08b-typecheck.log 2>&1; then grn "npm run typecheck"; else red "npm run typecheck FAILED (/tmp/ph08b-typecheck.log)"; fi
  if npm test >/tmp/ph08b-test.log 2>&1; then grn "npm test green (API suite incl. $T)"; else red "npm test FAILED (/tmp/ph08b-test.log)"; fi
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-08B met' || echo 'RED - PH-08B not complete') =="
exit "$fail"
