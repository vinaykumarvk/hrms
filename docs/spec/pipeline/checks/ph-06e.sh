#!/usr/bin/env bash
# PH-06E oracle (human gate support): full API+web suites green, targeted re-greps of the audit's
# previously-NOT_FOUND items closed in PH-06A..D, regression negatives (orders.length+1, generic
# CONFLICT), and an honest coverage-delta verdict at docs/spec/ph-06-verdict.md referencing the
# 2026-07-02 audit with per-module remaining-gap accounting. No plan-file or marker assertions.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
echo "== PH-06E exit-criteria (vertical-slice conformance + scale-up gate) =="

[ -d node_modules ] || red "node_modules absent — typecheck/test oracle cannot run (npm install required)"
G03=apps/api/src/modules/g03
G05=apps/api/src/modules/g05

# 1) full suites — RED on failure
npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "npm run typecheck FAILED"
npm test --silent >/dev/null 2>&1 && grn "npm test green" || red "npm test FAILED"
npm run -s web:typecheck >/dev/null 2>&1 && grn "npm run web:typecheck green" || red "npm run web:typecheck FAILED"
npm run -s web:test >/dev/null 2>&1 && grn "npm run web:test green" || red "npm run web:test FAILED"

# 2) re-greps of previously-NOT_FOUND audit items ("label::pattern::path" indexed list)
for spec in \
  "G03 LEAVE_OVERLAP emitted::LEAVE_OVERLAP::$G03" \
  "G03 INSUFFICIENT_BALANCE emitted::INSUFFICIENT_BALANCE::$G03" \
  "G03 OPTIMISTIC_LOCK_CONFLICT emitted::OPTIMISTIC_LOCK_CONFLICT::$G03" \
  "G03 withdraw behavior::withdraw[A-Za-z]* *\(::$G03" \
  "G03 holiday calendar consumed::holiday::$G03" \
  "G05 catalog code RELIEVING::\"RELIEVING\"::$G05" \
  "G05 catalog code JOINING::\"JOINING\"::$G05" \
  "G05 gapless sequence entity::order_?number_?sequence::$G05" \
  "G05 last working day::last_?working_?day|lastWorkingDay::$G05" \
  "G05 reversal-envelope cancel::reverseFromSource|reversalOfEventId|ingest/reversal::$G05" \
  "G03 service uses repository::repositor::$G03" \
  "G05 service uses repository::repositor::$G05" \
  "web g03 interactive form::onSubmit::apps/web/src/modules/g03" \
  "web g05 interactive form::onSubmit::apps/web/src/modules/g05" \
; do
  label="${spec%%::*}"; rest="${spec#*::}"; pat="${rest%%::*}"; path="${rest#*::}"
  grep -rqiE "$pat" "$path" 2>/dev/null && grn "$label" || red "regressed/missing: $label"
done

# 3) fail-closed regression negatives (audit findings must not return)
grep -qF 'orders.length + 1' apps/api/src/modules/g05/transferService.ts 2>/dev/null \
  && red "NEGATIVE: orders.length+1 numbering regressed" || grn "negative ok: no orders.length+1 numbering"
grep -rqF '"CONFLICT", "Leave balance is insufficient"' "$G03" 2>/dev/null \
  && red "NEGATIVE: generic CONFLICT for balance regressed" || grn "negative ok: named INSUFFICIENT_BALANCE retained"
grep -rqE 'TRANSFER_JOINED|TRANSFER_RETAINED|TRANSFER_DEEMED_RELIEVED' "$G05" 2>/dev/null \
  && red "NEGATIVE: non-catalog SR codes regressed in g05" || grn "negative ok: only frozen-catalog SR codes in g05"

# 4) honest coverage-delta verdict for the human gate
V=docs/spec/ph-06-verdict.md
if [ ! -s "$V" ] || [ "$(wc -c < "$V")" -lt 1500 ]; then
  red "missing/too-small coverage-delta verdict: $V (needs the real delta table, not a stub)"
else
  grn "verdict present: $V"
  grep -q 'brd-coverage-audit-20260702' "$V" && grn "verdict references the baseline audit" || red "verdict does not reference brd-coverage-audit-20260702"
  grep -qE '\|.*G03' "$V" && grep -qE '\|.*G05' "$V" && grn "verdict has per-module delta table rows (G03, G05)" || red "verdict lacks per-module delta table rows"
  grep -qiE 'NOT_FOUND|remaining' "$V" && grn "verdict accounts for remaining gaps" || red "verdict hides remaining gaps (no NOT_FOUND/remaining accounting)"
  grep -qiE 'apps/(api|web)/src[^ ]*' "$V" && grn "verdict cites implementing files as evidence" || red "verdict cites no file evidence"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN — PH-06E met (park for human scale-up approval)' || echo 'RED — PH-06E not complete') =="
exit "$fail"
