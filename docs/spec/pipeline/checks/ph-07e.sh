#!/usr/bin/env bash
# PH-07E oracle (human gate support): employee wave UI + conformance — G01 contacts/dependents edit
# forms, G02 change-request editor + approver queue + diff view, G03 self-service summary, all four
# suites green, re-greps of PH-07A..D closures, and an honest coverage-delta verdict at
# docs/spec/ph-07-verdict.md. Fail-closed negatives: skeleton forms (no onSubmit) and the hardcoded
# empty /employees/changes feed regressing are RED. No plan-file or marker assertions.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
echo "== PH-07E exit-criteria (employee wave UI + conformance) =="

[ -d node_modules ] || red "node_modules absent — typecheck/test oracle cannot run (npm install required)"
W1=apps/web/src/modules/g01
W2=apps/web/src/modules/g02
W3=apps/web/src/modules/g03

# 1) interactive employee-wave surfaces ("label::pattern::path" indexed list, BSD-grep safe)
for spec in \
  "g01 edit form::<form::$W1" \
  "g01 submit handler::onSubmit::$W1" \
  "g01 contacts surface::contact::$W1" \
  "g01 dependents surface::dependent::$W1" \
  "g01 uses shared client::from \"\.\./\.\./api|hrmsClient::$W1" \
  "g02 change-request form::<form::$W2" \
  "g02 submit handler::onSubmit::$W2" \
  "g02 approver actions::approve::$W2" \
  "g02 reject action::reject::$W2" \
  "g02 send-back action::sendBack|send_?back|send back::$W2" \
  "g02 diff view::diff::$W2" \
  "g02 uses shared client::from \"\.\./\.\./api|hrmsClient::$W2" \
  "g03 self-service summary surface::self-?service|SelfService::$W3" \
  "g03 uses shared client::from \"\.\./\.\./api|hrmsClient::$W3" \
; do
  label="${spec%%::*}"; rest="${spec#*::}"; pat="${rest%%::*}"; path="${rest#*::}"
  grep -rqiE "$pat" "$path" 2>/dev/null && grn "$label" || red "missing: $label"
done
for d in "$W1" "$W2" "$W3"; do
  grep -rqiE 'loading' "$d" 2>/dev/null && grep -rqiE 'error' "$d" 2>/dev/null \
    && grn "canonical states in $d" || red "missing loading/error states in $d"
done

# 2) fail-closed negatives: skeleton forms and backend regressions
for d in "$W1" "$W2"; do
  if grep -rqE '<form' "$d" 2>/dev/null && ! grep -rqE 'onSubmit' "$d" 2>/dev/null; then
    red "NEGATIVE: $d has a <form> with no onSubmit handler (skeleton UI)"
  fi
done
grn "negative skeleton-form detector evaluated"
grep -qF 'items: [], limit' apps/api/src/routes/g01.routes.ts 2>/dev/null \
  && red "NEGATIVE: hardcoded empty /employees/changes feed regressed" || grn "negative ok: changes feed still real"
grep -rqF '? "LOW" : "HIGH"' apps/api/src/modules/g02 2>/dev/null \
  && red "NEGATIVE: hardcoded G02 sensitivity ternary regressed" || grn "negative ok: catalog-driven sensitivity retained"

# 3) re-greps of PH-07A..D closures
for spec in \
  "G01 attribute history::attribute_?history|attributeHistory::apps/api/src/modules/g01" \
  "G01 outbox backbone::outbox::apps/api/src/modules/g01" \
  "G04 lineage::leave_?spell_?lineage|leaveSpellLineage::apps/api/src/modules/g04" \
  "G04 signature error::ERR-G04-SIGNATURE-INVALID::apps/api/src/modules/g04" \
  "G02 SoD code::ERR-G02-SOD::apps/api/src/modules/g02" \
  "G02 reason code::ERR-REASON-REQ::apps/api/src/modules/g02" \
  "G03 feed lock code::PERIOD_ALREADY_LOCKED::apps/api/src/modules/g03" \
  "G03 day status ON_LEAVE::\"ON_LEAVE\"::apps/api/src/modules/g03" \
; do
  label="${spec%%::*}"; rest="${spec#*::}"; pat="${rest%%::*}"; path="${rest#*::}"
  grep -rqiE "$pat" "$path" 2>/dev/null && grn "$label" || red "regressed/missing: $label"
done

# 4) web tests cover the new surfaces
grep -rqiE 'onSubmit' apps/web/test 2>/dev/null && grn "web tests assert submit handlers" || red "no web test asserting onSubmit"
grep -rqiE 'diff' apps/web/test 2>/dev/null && grn "web tests cover the diff view" || red "no web test covering the diff view"

# 5) full suites — RED on failure
npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "npm run typecheck FAILED"
npm test --silent >/dev/null 2>&1 && grn "npm test green" || red "npm test FAILED"
npm run -s web:typecheck >/dev/null 2>&1 && grn "npm run web:typecheck green" || red "npm run web:typecheck FAILED"
npm run -s web:test >/dev/null 2>&1 && grn "npm run web:test green" || red "npm run web:test FAILED"

# 6) honest coverage-delta verdict for the human gate
V=docs/spec/ph-07-verdict.md
if [ ! -s "$V" ] || [ "$(wc -c < "$V")" -lt 1500 ]; then
  red "missing/too-small coverage-delta verdict: $V (needs the real delta table, not a stub)"
else
  grn "verdict present: $V"
  grep -q 'brd-coverage-audit-20260702' "$V" && grn "verdict references the baseline audit" || red "verdict does not reference brd-coverage-audit-20260702"
  grep -qE '\|.*G01' "$V" && grep -qE '\|.*G02' "$V" && grep -qE '\|.*G0(3|4)' "$V" \
    && grn "verdict has per-module delta rows (G01/G02/G03-G04)" || red "verdict lacks per-module delta table rows"
  grep -qiE 'NOT_FOUND|remaining' "$V" && grn "verdict accounts for remaining gaps" || red "verdict hides remaining gaps (no NOT_FOUND/remaining accounting)"
  grep -qiE 'apps/(api|web)/src[^ ]*' "$V" && grn "verdict cites implementing files as evidence" || red "verdict cites no file evidence"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN — PH-07E met (park for human approval)' || echo 'RED — PH-07E not complete') =="
exit "$fail"
