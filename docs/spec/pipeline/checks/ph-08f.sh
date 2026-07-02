#!/usr/bin/env bash
# PH-08F oracle (re-baselined 2026-07-02 after docs/reviews/brd-coverage-audit-20260702.md):
# statutory wave UI + conformance — real forms (G09 workbench, G06 DPC per-member verdicts, G08 APAR
# self/RO/RvO, G07 nomination), canonical loading/empty/error states, full API+web suites green, and an
# HONEST verdict doc that deltas against the audit. Gate is HUMAN — this script only verifies evidence;
# it replaces the prior manifest/marker rubber stamp. No skeleton read-only cards accepted.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
srcq(){ _l="$1"; _p="$2"; shift 2; if grep -rqiE "$_p" "$@" 2>/dev/null; then grn "$_l"; else red "$_l (pattern: $_p)"; fi; }

WEB=apps/web/src/modules
WT=apps/web/test/ph08f-statutory-ui.test.cjs
V=docs/spec/ph-08-verdict.md
echo "== PH-08F exit-criteria (statutory wave UI + honest conformance) =="

[ -d node_modules ] || red "node_modules absent — typecheck/test oracle cannot run (install deps first)"

# 1) required interactive surfaces (audit: every module was a read-only metric card)
SURFACES=(
  'g09 case intake (complaint/case form)::intake|complaint'
  'g09 charge form::charge'
  'g06 DPC per-member verdict capture::verdict'
  'g06 DPC member-level capture::member'
  'g08 APAR self-appraisal form::self'
  'g08 APAR RO tier::reporting'
  'g08 APAR RvO tier::review'
  'g07 training nomination::nominat'
)
for item in "${SURFACES[@]}"; do
  _spec="${item%%::*}"; _pat="${item##*::}"
  _dir="$WEB/$(echo "$_spec" | cut -c1-3)"
  srcq "web: $_spec" "$_pat" "$_dir"
done

# 2) fail-closed: each module must have a real form (submit path), not a read-only card
for m in g06 g07 g08 g09; do
  if grep -rqiE '<form|onSubmit' "$WEB/$m" 2>/dev/null; then
    grn "$m has a real form/submit surface"
  else
    red "$m is still a read-only card — no <form>/onSubmit found (skeleton UI, audit inversion)"
  fi
done

# 3) canonical states per module surface
for m in g06 g07 g08 g09; do
  for s in loading empty error; do
    grep -rqiE "$s" "$WEB/$m" 2>/dev/null && grn "$m renders '$s' state" || red "$m missing '$s' state"
  done
done

# 4) web behavioural tests for the new surfaces (incl. error-state rendering)
if [ -s "$WT" ]; then grn "web test file: $WT"; else red "missing web test file: $WT"; fi
srcq "web test exercises a form submit path" 'form|submit' "$WT"
srcq "web test asserts an error state (fail-closed rendering)" 'error' "$WT"

# 5) honest verdict: must delta against the audit, not self-certify
if [ -s "$V" ]; then grn "verdict doc present: $V"; else red "missing verdict doc: $V"; fi
grep -q 'brd-coverage-audit-20260702' "$V" 2>/dev/null && grn "verdict cites the coverage audit baseline" || red "verdict does not cite docs/reviews/brd-coverage-audit-20260702.md — not an honest delta"
grep -qiE 'coverage.?delta|delta' "$V" 2>/dev/null && grn "verdict states a coverage delta" || red "verdict has no coverage-delta section"
grep -q 'NOT_FOUND' "$V" 2>/dev/null && grn "verdict acknowledges remaining NOT_FOUND items" || red "verdict does not state remaining NOT_FOUND areas (self-certification)"
for m in G05 G06 G07 G08 G09; do
  grep -q "$m" "$V" 2>/dev/null && grn "verdict covers $m" || red "verdict missing per-module delta for $m"
done

# 6) hygiene: no production console.log in web src
if grep -rq 'console\.log' apps/web/src 2>/dev/null; then red "console.log present in apps/web/src"; else grn "no console.log in apps/web/src"; fi

# 7) strong oracle: FULL API + web suites (RED on failure, never WARN)
if [ -d node_modules ]; then
  if npm run -s typecheck >/tmp/ph08f-typecheck.log 2>&1; then grn "npm run typecheck"; else red "npm run typecheck FAILED (/tmp/ph08f-typecheck.log)"; fi
  if npm test >/tmp/ph08f-test.log 2>&1; then grn "npm test green (full API suite)"; else red "npm test FAILED (/tmp/ph08f-test.log)"; fi
  if npm run -s web:typecheck >/tmp/ph08f-web-typecheck.log 2>&1; then grn "npm run web:typecheck"; else red "npm run web:typecheck FAILED (/tmp/ph08f-web-typecheck.log)"; fi
  if npm run -s web:test >/tmp/ph08f-web-test.log 2>&1; then grn "npm run web:test green (full web suite)"; else red "npm run web:test FAILED (/tmp/ph08f-web-test.log)"; fi
fi

echo "  NOTE human gate: GREEN here is necessary, not sufficient — a reviewer must approve the verdict packet."
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-08F evidence met (await human gate)' || echo 'RED - PH-08F not complete') =="
exit "$fail"
