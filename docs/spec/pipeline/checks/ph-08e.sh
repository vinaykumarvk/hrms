#!/usr/bin/env bash
# PH-08E oracle (re-baselined 2026-07-02 after docs/reviews/brd-coverage-audit-20260702.md):
# G09 disciplinary due process — preliminary inquiry, suspension + subsistence bounds, show-cause with
# DI-4 penalty subset, authority competence incl. the Art. 311 guard (mandatory negative test),
# consultation gate, disagreement memo, timeline hash chain + verify, abatement on death.
# Named ERR-G09-* codes must be real thrown values and the suite green. No marker-string greps.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
srcq(){ _l="$1"; _p="$2"; shift 2; if grep -rqiE "$_p" "$@" 2>/dev/null; then grn "$_l"; else red "$_l (pattern: $_p)"; fi; }
codeq(){ _l="$1"; _p="$2"; shift 2; if grep -rqE "$_p" "$@" 2>/dev/null; then grn "$_l"; else red "$_l (pattern: $_p)"; fi; }

G09MOD=apps/api/src/modules/g09
RT=apps/api/src/routes
T=apps/api/test/ph08e-g09-due-process.test.cjs
echo "== PH-08E exit-criteria (G09 disciplinary due process) =="

[ -d node_modules ] || red "node_modules absent — typecheck/test oracle cannot run (install deps first)"

# 1) BRD-named natural-justice behaviours in the G09 surface
ENTITIES=(
  'preliminary inquiry::preliminary.?inquir'
  'suspension lifecycle::suspension'
  'subsistence allowance bounds::subsistence'
  'show-cause notice::show.?cause'
  'proposed penalty (DI-4 subset)::proposed.?penalt'
  'authority competence matrix::authority.?competence'
  'Art. 311 subordinate guard::subordinate'
  'consultation gate::consultation'
  'disagreement memo::disagreement'
  'case timeline events::timeline'
  'hash chain prev link::prev.?hash'
  'hash chain row hash::row.?hash'
  'abatement on death::abate'
)
for item in "${ENTITIES[@]}"; do
  srcq "src: ${item%%::*}" "${item##*::}" "$G09MOD" "$RT"
done

# 2) BRD domain codes as string literals (case-sensitive)
CODES=(
  'ERR-G09-AUTHORITY-NOT-COMPETENT'
  'ERR-G09-CONSULTATION-PENDING'
  'ERR-G09-PENALTY-EXCEEDS-PROPOSED'
  'ERR-G09-SUBSISTENCE-OUT-OF-BOUNDS'
  'ERR-G09-CASE-ABATED'
  'ERR-G09-AUDIT-CHAIN-BROKEN'
  'DISMISSAL'
)
for c in "${CODES[@]}"; do
  codeq "src carries code literal $c" "\"$c\"" "$G09MOD" "$RT"
done

# 3) behavioural tests — named suite that `npm test` must run green
if [ -s "$T" ]; then grn "test file: $T"; else red "missing test file: $T"; fi
TESTS=(
  'preliminary inquiry exercised::preliminary.?inquir'
  'subsistence bounds exercised::subsistence'
  'disagreement memo exercised::disagreement'
  'chain verify / tamper detection::row.?hash|tamper'
)
for item in "${TESTS[@]}"; do
  srcq "test: ${item%%::*}" "${item##*::}" "$T"
done
# mandatory Art. 311 negative: DISMISSAL by subordinate authority rejected
codeq "NEGATIVE (mandatory): DISMISSAL by subordinate authority via error.code" 'code === "ERR-G09-AUTHORITY-NOT-COMPETENT"' "$T"
codeq "Art-311 negative exercises DISMISSAL penalty" '"DISMISSAL"' "$T"
codeq "negative: pending consultation blocks finalise via error.code" 'code === "ERR-G09-CONSULTATION-PENDING"' "$T"
codeq "negative: penalty beyond show-cause subset via error.code" 'code === "ERR-G09-PENALTY-EXCEEDS-PROPOSED"' "$T"
codeq "negative: abated case blocks penalty finalise via error.code" 'code === "ERR-G09-CASE-ABATED"' "$T"
codeq "negative: broken timeline chain detected via error.code" 'code === "ERR-G09-AUDIT-CHAIN-BROKEN"' "$T"
grep -q 'assert\.throws' "$T" 2>/dev/null && grn "fail-closed negatives use assert.throws" || red "no assert.throws negative in $T"
if grep -q 'details\.marker' "$T" 2>/dev/null; then red "marker-string assertion regression in $T (assert error.code, not details.marker)"; else grn "no marker-string indirection in $T"; fi

# 4) strong oracle: typecheck + full API suite (RED on failure, never WARN)
if [ -d node_modules ]; then
  if npm run -s typecheck >/tmp/ph08e-typecheck.log 2>&1; then grn "npm run typecheck"; else red "npm run typecheck FAILED (/tmp/ph08e-typecheck.log)"; fi
  if npm test >/tmp/ph08e-test.log 2>&1; then grn "npm test green (API suite incl. $T)"; else red "npm test FAILED (/tmp/ph08e-test.log)"; fi
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-08E met' || echo 'RED - PH-08E not complete') =="
exit "$fail"
