#!/usr/bin/env bash
# PH-08C oracle (re-baselined 2026-07-02 after docs/reviews/brd-coverage-audit-20260702.md):
# G06 promotion depth — QSL-backed eligibility + APAR gate, zone of consideration, reservation
# rosters with own-merit migration, refusal debarment, probation auto-creation, sub-judice gate,
# and real domain error codes (audit found only generic codes with marker strings). Suite must be green.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
srcq(){ _l="$1"; _p="$2"; shift 2; if grep -rqiE "$_p" "$@" 2>/dev/null; then grn "$_l"; else red "$_l (pattern: $_p)"; fi; }
codeq(){ _l="$1"; _p="$2"; shift 2; if grep -rqE "$_p" "$@" 2>/dev/null; then grn "$_l"; else red "$_l (pattern: $_p)"; fi; }

G06MOD=apps/api/src/modules/g06
G06RT=apps/api/src/routes
WEB06=apps/web/src/modules/g06
T=apps/api/test/ph08c-g06-depth.test.cjs
echo "== PH-08C exit-criteria (G06 promotion/seniority/DPC/MACP to BRD depth) =="

[ -d node_modules ] || red "node_modules absent — typecheck/test oracle cannot run (install deps first)"

# 1) BRD-named behaviours in the G06 surface
ENTITIES=(
  'eligibility engine::eligibilit'
  'eligibility reads qualifying service (QSL)::qualifying.?service'
  'APAR usability gate::apar'
  'zone of consideration::zone.?of.?consideration|zoneOfConsideration'
  'reservation roster::reservation.?roster'
  'roster points::roster.?point'
  'own-merit migration::own.?merit'
  'adjusted-against category::adjusted.?against'
  'refusal consequences::refusal'
  'debarment window::debarment'
  'probation lifecycle::probation'
)
for item in "${ENTITIES[@]}"; do
  srcq "src: ${item%%::*}" "${item##*::}" "$G06MOD" "$G06RT"
done

# 2) BRD domain codes as string literals in the G06 surface (case-sensitive; not marker strings)
CODES=(
  'QUORUM_NOT_MET'
  'PANEL_CONFLICT_OF_INTEREST'
  'SENIORITY_LIST_NOT_FINAL'
  'ENTITY_SUB_JUDICE'
  'EMPLOYEE_DEBARRED'
  'OWN_MERIT_MIGRATION_REQUIRED'
  'APAR_NOT_USABLE'
)
for c in "${CODES[@]}"; do
  codeq "src carries domain code literal $c" "\"$c\"" "$G06MOD" "$G06RT"
done

# 3) web module rename reconciled (audit flagged `ln` export vs PromotionWorkspace declaration)
codeq "g06 web module exports PromotionWorkspace" 'export (function|const|class) PromotionWorkspace' "$WEB06"
codeq "App.tsx consumes PromotionWorkspace" 'PromotionWorkspace' apps/web/src/App.tsx
if grep -rqE 'export (const|function|class) ln[^a-zA-Z0-9_]' "$WEB06" 2>/dev/null || grep -rq 'export { ln' "$WEB06" 2>/dev/null; then
  red "broken rename: g06 web module still exports 'ln'"
else
  grn "no stray 'ln' export in g06 web module"
fi

# 4) behavioural tests — named suite that `npm test` must run green
if [ -s "$T" ]; then grn "test file: $T"; else red "missing test file: $T"; fi
TESTS=(
  'eligibility driven by QSL::qualifying|qsl'
  'roster own-merit path exercised::own.?merit'
  'refusal debarment exercised::debarment'
  'probation auto-created on order effect::probation'
)
for item in "${TESTS[@]}"; do
  srcq "test: ${item%%::*}" "${item##*::}" "$T"
done
codeq "negative: DPC quorum rejected via error.code" 'code === "QUORUM_NOT_MET"' "$T"
codeq "negative: panel conflict-of-interest rejected via error.code" 'code === "PANEL_CONFLICT_OF_INTEREST"' "$T"
codeq "negative: non-final seniority list rejected via error.code" 'code === "SENIORITY_LIST_NOT_FINAL"' "$T"
codeq "negative: debarred employee re-consideration rejected via error.code" 'code === "EMPLOYEE_DEBARRED"' "$T"
codeq "negative: sub-judice stay blocks effecting via error.code" 'code === "ENTITY_SUB_JUDICE"' "$T"
codeq "own-merit migration code asserted" 'OWN_MERIT_MIGRATION_REQUIRED' "$T"
grep -q 'assert\.throws' "$T" 2>/dev/null && grn "fail-closed negatives use assert.throws" || red "no assert.throws negative in $T"
if grep -q 'details\.marker' "$T" 2>/dev/null; then red "marker-string assertion regression in $T (assert error.code, not details.marker)"; else grn "no marker-string indirection in $T"; fi

# 5) strong oracle: typecheck + API suite + web typecheck (RED on failure, never WARN)
if [ -d node_modules ]; then
  if npm run -s typecheck >/tmp/ph08c-typecheck.log 2>&1; then grn "npm run typecheck"; else red "npm run typecheck FAILED (/tmp/ph08c-typecheck.log)"; fi
  if npm run -s web:typecheck >/tmp/ph08c-web-typecheck.log 2>&1; then grn "npm run web:typecheck (export rename reconciled)"; else red "npm run web:typecheck FAILED (/tmp/ph08c-web-typecheck.log)"; fi
  if npm test >/tmp/ph08c-test.log 2>&1; then grn "npm test green (API suite incl. $T)"; else red "npm test FAILED (/tmp/ph08c-test.log)"; fi
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-08C met' || echo 'RED - PH-08C not complete') =="
exit "$fail"
