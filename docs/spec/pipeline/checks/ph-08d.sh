#!/usr/bin/env bash
# PH-08D oracle (re-baselined 2026-07-02 after docs/reviews/brd-coverage-audit-20260702.md):
# G07 training + G08 APAR to BRD depth — competency taxonomy, Gap Contract (FR-G07-024),
# lapsed_mandatory certs, campaign engine, appraisal cycles/templates/scales, WSUM weightage lock,
# disclosure + representation window, multi-RO part-period, SLA escalation. Suite must be green.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
srcq(){ _l="$1"; _p="$2"; shift 2; if grep -rqiE "$_p" "$@" 2>/dev/null; then grn "$_l"; else red "$_l (pattern: $_p)"; fi; }
codeq(){ _l="$1"; _p="$2"; shift 2; if grep -rqE "$_p" "$@" 2>/dev/null; then grn "$_l"; else red "$_l (pattern: $_p)"; fi; }

G07MOD=apps/api/src/modules/g07
G08MOD=apps/api/src/modules/g08
RT=apps/api/src/routes
T=apps/api/test/ph08d-g07-g08-depth.test.cjs
echo "== PH-08D exit-criteria (G07 training + G08 APAR to BRD depth) =="

[ -d node_modules ] || red "node_modules absent — typecheck/test oracle cannot run (install deps first)"

# 1) G07 BRD-named behaviours
G07E=(
  'competency taxonomy::competenc'
  'role competency models::competency.?model'
  'employee skill inventory::employee.?skill'
  'gap analysis::skill.?gap|gap.?analys'
  'Gap Contract (FR-G07-024)::gap.?contract'
  'cert validity / renewal::valid.?until|renewal'
  'lapsed mandatory certification::lapsed.?mandatory'
  'campaign engine::campaign'
  'campaign escalation::escalat'
)
for item in "${G07E[@]}"; do
  srcq "g07 src: ${item%%::*}" "${item##*::}" "$G07MOD" "$RT"
done
srcq "gap-contract route exposed for G06/G08 consumption" 'gap.?contract' "$RT"

# 2) G08 BRD-named behaviours
G08E=(
  'appraisal cycles::appraisal.?cycle'
  'appraisal templates::template'
  'rating scales::rating.?scale'
  'goal weightage::weightage'
  'disclosure to employee::disclos'
  'representation window::representation'
  'multi-RO part-period::report.?period|part.?period|supervision'
  'SLA escalation / escalated author::escalat'
)
for item in "${G08E[@]}"; do
  srcq "g08 src: ${item%%::*}" "${item##*::}" "$G08MOD" "$RT"
done

# 3) named validations + domain codes as string literals (case-sensitive)
codeq "WSUM weightage validation named in g08" 'WSUM' "$G08MOD"
for c in ERR-G08-WEIGHTAGE ERR-G08-REPWINDOW; do
  codeq "src carries domain code literal $c" "\"$c\"" "$G08MOD" "$RT"
done

# 4) behavioural tests — named suite that `npm test` must run green
if [ -s "$T" ]; then grn "test file: $T"; else red "missing test file: $T"; fi
TESTS=(
  'Gap Contract published/consumed::gap.?contract'
  'lapsed_mandatory flip exercised::lapsed'
  'campaign wave/escalation exercised::campaign'
  'multi-RO part-period aggregation::supervision|part.?period'
  'representation window exercised::representation'
)
for item in "${TESTS[@]}"; do
  srcq "test: ${item%%::*}" "${item##*::}" "$T"
done
codeq "negative: weightage != 100 rejected at lock via error.code" 'code === "ERR-G08-WEIGHTAGE"' "$T"
codeq "negative: elapsed representation window rejected via error.code" 'code === "ERR-G08-REPWINDOW"' "$T"
grep -q 'assert\.throws' "$T" 2>/dev/null && grn "fail-closed negatives use assert.throws" || red "no assert.throws negative in $T"
if grep -q 'details\.marker' "$T" 2>/dev/null; then red "marker-string assertion regression in $T (assert error.code, not details.marker)"; else grn "no marker-string indirection in $T"; fi

# 5) strong oracle: typecheck + full API suite (RED on failure, never WARN)
if [ -d node_modules ]; then
  if npm run -s typecheck >/tmp/ph08d-typecheck.log 2>&1; then grn "npm run typecheck"; else red "npm run typecheck FAILED (/tmp/ph08d-typecheck.log)"; fi
  if npm test >/tmp/ph08d-test.log 2>&1; then grn "npm test green (API suite incl. $T)"; else red "npm test FAILED (/tmp/ph08d-test.log)"; fi
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-08D met' || echo 'RED - PH-08D not complete') =="
exit "$fail"
