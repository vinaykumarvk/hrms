#!/usr/bin/env bash
# PH-07C oracle: G02 personal-details workflow at BRD depth — field_sensitivity_catalog +
# approval_matrix_config consumed, SoD maker!=checker (ERR-G02-SOD), RETURNED/sendBack + resubmit +
# withdraw transitions, mandatory reject/return reason (ERR-REASON-REQ), masked field-diff endpoint.
# REAL-outcome oracle with fail-closed negatives: the hardcoded LOW/HIGH sensitivity ternary must be
# gone and an SoD negative test must exist. No plan-file or marker assertions.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
echo "== PH-07C exit-criteria (G02 personal details workflow -> BRD depth) =="

[ -d node_modules ] || red "node_modules absent — typecheck/test oracle cannot run (npm install required)"
G02=apps/api/src/modules/g02
R02=apps/api/src/routes/g02.routes.ts

# 1) config entities + named codes + statuses in g02 source ("label::pattern" list, BSD-grep safe)
for spec in \
  "field_sensitivity_catalog consumed::field_?sensitivity_?catalog|fieldSensitivityCatalog" \
  "approval_matrix_config consumed::approval_?matrix|approvalMatrix" \
  "SoD code ERR-G02-SOD::ERR-G02-SOD" \
  "mandatory reason code ERR-REASON-REQ::ERR-REASON-REQ" \
  "RETURNED status::\"RETURNED\"" \
  "sendBack/return transition::sendBack|send_?back" \
  "resubmit transition::resubmit" \
  "withdraw transition::withdraw[A-Za-z]* *\(" \
; do
  label="${spec%%::*}"; pat="${spec#*::}"
  grep -rqiE "$pat" "$G02" 2>/dev/null && grn "$label in g02 src" || red "missing in g02 src: $label"
done

# 2) fail-closed negative: hardcoded sensitivity ternary must be gone (audit finding)
if grep -rqF '? "LOW" : "HIGH"' "$G02" 2>/dev/null; then
  red "NEGATIVE: field sensitivity still hardcoded (LOW/HIGH ternary) instead of field_sensitivity_catalog"
else grn "negative ok: hardcoded LOW/HIGH sensitivity removed"; fi

# 3) field diff endpoint with P02 masking
grep -qE '/diff' "$R02" 2>/dev/null && grn "diff route registered in g02.routes.ts" || red "no /diff route in g02.routes.ts"
grep -rqiE 'mask' "$G02" "$R02" 2>/dev/null && grn "diff/masking path uses P02 masking" || red "no masking in g02 diff path"

# 4) persistence of the two config entities
sqlhit(){ find apps/api -path '*node_modules*' -prune -o -iname '*.sql' -print0 2>/dev/null | xargs -0 grep -liE "create table (if not exists )?[a-z0-9_]*$1" 2>/dev/null | grep -q .; }
for t in field_sensitivity_catalog approval_matrix_config; do
  sqlhit "$t" && grn "migration DDL present: $t" || red "no migration DDL under apps/api for: $t"
done

# 5) behavior tests incl. the SoD fail-closed negative (same actor makes and checks -> rejected)
for spec in \
  "SoD negative test::ERR-G02-SOD" \
  "mandatory-reason negative test::ERR-REASON-REQ" \
  "RETURNED/resubmit coverage::resubmit|RETURNED" \
  "withdraw coverage::withdraw" \
  "masked diff assertion::/diff|fieldDiff|Diff\(" \
; do
  label="${spec%%::*}"; pat="${spec#*::}"
  grep -rqiE "$pat" apps/api/test 2>/dev/null && grn "$label present in apps/api/test" || red "missing $label in apps/api/test"
done

# 6) toolchain oracles — RED on failure
npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "npm run typecheck FAILED"
npm test --silent >/dev/null 2>&1 && grn "npm test green (full API suite incl. G02 depth tests)" || red "npm test FAILED"

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN — PH-07C met' || echo 'RED — PH-07C not complete') =="
exit "$fail"
