#!/usr/bin/env bash
# PH-06C oracle: G05 transfer backend at BRD depth — gapless reserve-then-commit numbering, relieving
# order + last_working_day, joining report + G01 posting update, frozen-catalog SR codes
# (TRANSFER/RELIEVING/JOINING), cancel via SR reversal envelope, configurable clearance departments.
# REAL-outcome oracle with fail-closed negatives against the audit findings (orders.length+1,
# non-catalog TRANSFER_JOINED codes, hardcoded defaultClearances). No plan-file/marker assertions.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
echo "== PH-06C exit-criteria (G05 transfer backend -> BRD depth) =="

[ -d node_modules ] || red "node_modules absent — typecheck/test oracle cannot run (npm install required)"
G05=apps/api/src/modules/g05
TS=apps/api/src/modules/g05/transferService.ts

# 1) gapless numbering via order_number_sequences with reserve-then-commit
grep -rqiE 'order_?number_?sequence' "$G05" 2>/dev/null && grn "order_number_sequences entity consumed" || red "order_number_sequences not consumed in g05"
grep -rqiE 'reserve' "$G05" 2>/dev/null && grn "reserve-then-commit numbering path present" || red "no reserve semantics for order numbering in g05"
if grep -qF 'orders.length + 1' "$TS" 2>/dev/null; then
  red "NEGATIVE: orderNo still derived from orders.length + 1 (audit finding — not gapless)"
else grn "negative ok: orders.length+1 numbering removed"; fi

# 2) relieving order + last working day, joining report ("label::pattern" list, BSD-grep safe)
for spec in \
  "relieving order entity::relieving_?order|relievingOrder" \
  "last working day field::last_?working_?day|lastWorkingDay" \
  "joining report entity::joining_?report|joiningReport" \
; do
  label="${spec%%::*}"; pat="${spec#*::}"
  grep -rqiE "$pat" "$G05" 2>/dev/null && grn "$label in g05 src" || red "missing in g05 src: $label"
done

# 3) G01 posting update on join (both call site and implementation)
grep -rqE 'applyTransferPosting' "$G05" 2>/dev/null && grn "g05 invokes applyTransferPosting on join" || red "g05 does not invoke applyTransferPosting"
grep -qE 'applyTransferPosting' apps/api/src/modules/g01/employeeMasterService.ts 2>/dev/null && grn "EmployeeMasterService.applyTransferPosting implemented" || red "applyTransferPosting missing in employeeMasterService"

# 4) SR event codes conform to the frozen G12 catalog
for code in '"TRANSFER"' '"RELIEVING"' '"JOINING"'; do
  grep -rqF "eventTypeCode: $code" "$G05" 2>/dev/null || grep -rqF "$code" "$G05" 2>/dev/null \
    && grn "catalog SR code emitted: $code" || red "catalog SR code not emitted in g05: $code"
done
if grep -rqE 'TRANSFER_JOINED|TRANSFER_RETAINED|TRANSFER_DEEMED_RELIEVED' "$G05" 2>/dev/null; then
  red "NEGATIVE: non-catalog SR codes still emitted (TRANSFER_JOINED/TRANSFER_RETAINED/TRANSFER_DEEMED_RELIEVED)"
else grn "negative ok: non-catalog SR codes removed from g05"; fi

# 5) cancellation via SR reversal envelope, not a bare new event
grep -rqE 'reverseFromSource|reversalOfEventId|ingest/reversal|is_reversal' "$G05" 2>/dev/null \
  && grn "cancel flows through SR reversal envelope" || red "cancel does not use the SR reversal envelope"

# 6) configurable clearance departments (persisted checklist, no hardcoded 3-item array)
grep -rqiE 'clearance_?checklist' "$G05" 2>/dev/null && grn "clearance_checklists entity consumed" || red "clearance_checklists not consumed in g05"
grep -rqiE 'clearance_?department' "$G05" 2>/dev/null && grn "clearance departments configuration consumed" || red "clearance departments not configuration-driven in g05"
if grep -qE 'function defaultClearances' "$TS" 2>/dev/null; then
  red "NEGATIVE: hardcoded defaultClearances() array still present (audit finding)"
else grn "negative ok: hardcoded defaultClearances removed"; fi

# 7) persistence: migration DDL for the relieving/joining entities
sqlhit(){ find apps/api -path '*node_modules*' -prune -o -iname '*.sql' -print0 2>/dev/null | xargs -0 grep -liE "create table (if not exists )?[a-z0-9_]*$1" 2>/dev/null | grep -q .; }
for t in relieving_orders joining_reports order_number_sequences; do
  sqlhit "$t" && grn "migration DDL present: $t" || red "no migration DDL under apps/api for: $t"
done

# 8) behavior tests for the new depth (same-file conjunctions so unrelated modules cannot satisfy them)
for spec in \
  "test asserting RELIEVING SR event::\"RELIEVING\"" \
  "test asserting JOINING SR event::\"JOINING\"" \
  "test covering posting update::applyTransferPosting" \
; do
  label="${spec%%::*}"; pat="${spec#*::}"
  grep -rqiE "$pat" apps/api/test 2>/dev/null && grn "$label present in apps/api/test" || red "missing $label in apps/api/test"
done
rtf=""
for f in apps/api/test/*.test.cjs; do
  [ -f "$f" ] || continue
  if grep -qi 'transfer' "$f" 2>/dev/null && grep -qi 'reversal' "$f" 2>/dev/null && grep -qi 'cancel' "$f" 2>/dev/null; then rtf="$f"; break; fi
done
[ -n "$rtf" ] && grn "transfer reversal-cancel test present ($rtf)" || red "no test file covering transfer cancel via reversal"

# 9) toolchain oracles — RED on failure
npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "npm run typecheck FAILED"
npm test --silent >/dev/null 2>&1 && grn "npm test green (full API suite incl. new G05 tests)" || red "npm test FAILED"

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN — PH-06C met' || echo 'RED — PH-06C not complete') =="
exit "$fail"
