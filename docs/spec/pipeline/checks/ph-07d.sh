#!/usr/bin/env bash
# PH-07D oracle: G03 attendance/leave/payroll feed — payroll_attendance_feed entity with period lock
# (PERIOD_ALREADY_LOCKED), locked-period adjustment emission, attendance day statuses beyond the stub
# (ON_LEAVE/HOLIDAY/HALF_DAY), regularisation window/cap (WINDOW_EXPIRED). REAL-outcome oracle with a
# fail-closed negative: the old narrow PRESENT|ANOMALY|REGULARISED status union must be gone, and a
# feed lock test must exist and the suite must be green. No plan-file or marker assertions.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
echo "== PH-07D exit-criteria (G03 attendance/payroll feed) =="

[ -d node_modules ] || red "node_modules absent — typecheck/test oracle cannot run (npm install required)"
G03=apps/api/src/modules/g03

# 1) feed entity, lock code, adjustments, day statuses, window code ("label::pattern" list)
for spec in \
  "payroll_attendance_feed entity::payroll_?attendance_?feed|payrollAttendanceFeed" \
  "period lock code PERIOD_ALREADY_LOCKED::PERIOD_ALREADY_LOCKED" \
  "locked-period adjustment path::feed_?adjust|feedAdjust|LOCKED_PERIOD_ADJUSTMENT_EMITTED" \
  "day status ON_LEAVE::\"ON_LEAVE\"" \
  "day status HOLIDAY::\"HOLIDAY\"" \
  "day status HALF_DAY::\"HALF_DAY\"" \
  "regularisation window code WINDOW_EXPIRED::WINDOW_EXPIRED" \
; do
  label="${spec%%::*}"; pat="${spec#*::}"
  grep -rqiE "$pat" "$G03" 2>/dev/null && grn "$label in g03 src" || red "missing in g03 src: $label"
done

# 2) fail-closed negative: the audit's narrow attendance status union must be gone
if grep -rqF '"PRESENT" | "ANOMALY" | "REGULARISED";' "$G03" 2>/dev/null; then
  red "NEGATIVE: attendance day status still limited to PRESENT|ANOMALY|REGULARISED (audit finding)"
else grn "negative ok: attendance status union extended beyond the stub"; fi

# 3) persistence: migration DDL for feed + adjustments + lock periods
sqlhit(){ find apps/api -path '*node_modules*' -prune -o -iname '*.sql' -print0 2>/dev/null | xargs -0 grep -liE "create table (if not exists )?[a-z0-9_]*$1" 2>/dev/null | grep -q .; }
for t in payroll_attendance_feed payroll_feed_adjustments; do
  sqlhit "$t" && grn "migration DDL present: $t" || red "no migration DDL under apps/api for: $t"
done

# 4) behavior tests: feed lock (negative), adjustment emission, derivation, window negative
for spec in \
  "feed lock negative test::PERIOD_ALREADY_LOCKED" \
  "locked-period adjustment test::feed_?adjust|feedAdjust|LOCKED_PERIOD_ADJUSTMENT_EMITTED" \
  "ON_LEAVE derivation test::ON_LEAVE" \
  "WINDOW_EXPIRED negative test::WINDOW_EXPIRED" \
; do
  label="${spec%%::*}"; pat="${spec#*::}"
  grep -rqiE "$pat" apps/api/test 2>/dev/null && grn "$label present in apps/api/test" || red "missing $label in apps/api/test"
done

# 5) toolchain oracles — RED on failure
npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "npm run typecheck FAILED"
npm test --silent >/dev/null 2>&1 && grn "npm test green (full API suite incl. feed lock test)" || red "npm test FAILED"

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN — PH-07D met' || echo 'RED — PH-07D not complete') =="
exit "$fail"
