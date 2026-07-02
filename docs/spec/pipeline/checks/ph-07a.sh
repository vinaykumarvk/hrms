#!/usr/bin/env bash
# PH-07A oracle: G01 satellite persistence + transactional outbox backbone. REAL-outcome oracle:
# satellite entities (contacts/addresses/dependents) and employee_attribute_history consumed by g01,
# outbox_events with ordered cursor feed behind /api/v1/employees/changes, transactional emission,
# outbox feed test present, suites green. Fail-closed negative: the audit's hardcoded `items: []`
# changes feed must be gone. No plan-file or marker assertions.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
echo "== PH-07A exit-criteria (G01 satellites + transactional outbox) =="

[ -d node_modules ] || red "node_modules absent — typecheck/test oracle cannot run (npm install required)"
G01=apps/api/src/modules/g01
R01=apps/api/src/routes/g01.routes.ts

# 1) satellite entities + attribute-history spine consumed by g01 ("label::pattern" list)
for spec in \
  "employee_contacts entity::employee_?contacts|EmployeeContact" \
  "employee_addresses entity::employee_?addresses|EmployeeAddress" \
  "employee_dependents entity::employee_?dependents|EmployeeDependent|dependent" \
  "employee_attribute_history spine::attribute_?history|attributeHistory" \
; do
  label="${spec%%::*}"; pat="${spec#*::}"
  grep -rqiE "$pat" "$G01" 2>/dev/null && grn "$label consumed in g01 src" || red "missing in g01 src: $label"
done

# 2) migration DDL for the new tables under apps/api (persistence, not in-memory)
sqlhit(){ find apps/api -path '*node_modules*' -prune -o -iname '*.sql' -print0 2>/dev/null | xargs -0 grep -liE "create table (if not exists )?[a-z0-9_]*$1" 2>/dev/null | grep -q .; }
for t in employee_contacts employee_addresses employee_attribute_history outbox_events; do
  sqlhit "$t" && grn "migration DDL present: $t" || red "no migration DDL under apps/api for: $t"
done

# 3) transactional outbox backbone wired into the mutation path
grep -rqiE 'outbox' "$G01" apps/api/src/db 2>/dev/null && grn "outbox consumed by g01/db layer" || red "outbox_events not consumed in g01/db layer"
grep -rqiE 'transaction|BEGIN' "$G01" apps/api/src/db 2>/dev/null && grn "transactional write path present" || red "no transactional write path for outbox emission"

# 4) real ordered-cursor changes feed; fail-closed negative on the audit's hardcoded []
grep -qiE 'outbox|change_?feed' "$R01" "$G01"/*.ts 2>/dev/null && grn "/employees/changes served from outbox feed" || red "changes route not wired to the outbox feed"
if grep -iE 'cursor' "$R01" 2>/dev/null | grep -vE 'next_cursor: null' | grep -q .; then
  grn "cursor pagination on changes route (beyond the null stub)"
else red "no real cursor handling on changes route (next_cursor: null stub does not count)"; fi
if grep -qF 'items: [], limit' "$R01" 2>/dev/null; then
  red "NEGATIVE: /employees/changes (or governed-changes) still returns hardcoded empty items (audit finding)"
else grn "negative ok: hardcoded empty changes feed removed"; fi

# 5) outbox feed test: one test file must cover BOTH the outbox and cursor ordering (not scattered mentions)
otf=""
for f in apps/api/test/*.test.cjs; do
  [ -f "$f" ] || continue
  if grep -qi 'outbox' "$f" 2>/dev/null && grep -qi 'cursor' "$f" 2>/dev/null && grep -qiE 'changes|change_?feed' "$f" 2>/dev/null; then otf="$f"; break; fi
done
[ -n "$otf" ] && grn "outbox feed test with cursor ordering present ($otf)" || red "no single test file covering outbox feed + cursor ordering + changes feed"

# 6) toolchain oracles — RED on failure
npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "npm run typecheck FAILED"
npm test --silent >/dev/null 2>&1 && grn "npm test green (full API suite incl. outbox feed test)" || red "npm test FAILED"

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN — PH-07A met' || echo 'RED — PH-07A not complete') =="
exit "$fail"
