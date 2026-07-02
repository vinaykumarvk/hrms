#!/usr/bin/env bash
# PH-06B oracle: G03 leave backend at BRD depth (FR-02 holidays, FR-10 config entities, FR-13 withdraw/
# partial cancel, named errors, optimistic locking). REAL-outcome oracle: BRD-named codes emitted from
# g03 source, config entities consumed, behavior tests present, full suites green. Includes fail-closed
# negatives against the audit's findings (generic CONFLICT). No plan-file or marker assertions.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
echo "== PH-06B exit-criteria (G03 leave backend -> BRD depth) =="

[ -d node_modules ] || red "node_modules absent — typecheck/test oracle cannot run (npm install required)"
G03=apps/api/src/modules/g03

# 1) BRD-named error codes emitted from g03 source ("label::pattern" indexed list, bash 3.2 / BSD grep safe)
for spec in \
  "named error INSUFFICIENT_BALANCE::INSUFFICIENT_BALANCE" \
  "named error LEAVE_OVERLAP::LEAVE_OVERLAP" \
  "named error ELIGIBILITY_FAILED::ELIGIBILITY_FAILED" \
  "named error ENTITLEMENT_EXCEEDED::ENTITLEMENT_EXCEEDED" \
  "named error OPTIMISTIC_LOCK_CONFLICT::OPTIMISTIC_LOCK_CONFLICT" \
; do
  label="${spec%%::*}"; pat="${spec#*::}"
  grep -rqE "$pat" "$G03" 2>/dev/null && grn "$label in g03 src" || red "missing in g03 src: $label"
done

# 2) FR-10 / FR-02 entities consumed by the module (config-driven, not free strings / hardcoded 30)
grep -rqiE 'leave_?types|leave_?type_?config' "$G03" 2>/dev/null && grn "leave_types config entity consumed" || red "leave_types config entity not consumed in g03"
grep -rqiE 'accrual_?polic' "$G03" 2>/dev/null && grn "leave_accrual_policies consumed" || red "leave_accrual_policies not consumed in g03"
grep -rqiE 'holiday' "$G03" 2>/dev/null && grn "holiday calendar consumed (FR-02)" || red "holiday calendar not consumed in g03 (FR-02)"

# 3) FR-13 withdraw + partial cancel exposed as behavior and routed
grep -rqE 'withdraw[A-Za-z]* *\(' "$G03" 2>/dev/null && grn "withdraw behavior in g03 service layer" || red "no withdraw method in g03 src (FR-13; the WITHDRAWN status literal alone does not count)"
grep -qiE 'withdraw' apps/api/src/routes/g03.routes.ts 2>/dev/null && grn "withdraw route registered" || red "no withdraw route in g03.routes.ts"
grep -rqiE 'partial' "$G03" 2>/dev/null && grn "partial cancellation behavior in g03" || red "no partial cancellation in g03 src (FR-13)"

# 4) fail-closed negative: audit finding — generic CONFLICT for insufficient balance must be gone
if grep -rqF '"CONFLICT", "Leave balance is insufficient"' "$G03" 2>/dev/null; then
  red "NEGATIVE: generic CONFLICT still thrown for insufficient balance (must be INSUFFICIENT_BALANCE)"
else grn "negative ok: generic CONFLICT for balance replaced by named code"; fi

# 5) behavior tests exist for the new depth (assert the named codes from executed behavior)
for spec in \
  "test asserting LEAVE_OVERLAP::LEAVE_OVERLAP" \
  "test asserting INSUFFICIENT_BALANCE::INSUFFICIENT_BALANCE" \
  "test asserting OPTIMISTIC_LOCK_CONFLICT::OPTIMISTIC_LOCK_CONFLICT" \
  "test covering withdraw::withdraw" \
  "test covering partial cancel::partial" \
; do
  label="${spec%%::*}"; pat="${spec#*::}"
  grep -rqiE "$pat" apps/api/test 2>/dev/null && grn "$label present in apps/api/test" || red "missing $label in apps/api/test"
done

# 6) toolchain oracles — RED on failure
npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "npm run typecheck FAILED"
npm test --silent >/dev/null 2>&1 && grn "npm test green (full API suite incl. new G03 tests)" || red "npm test FAILED"

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN — PH-06B met' || echo 'RED — PH-06B not complete') =="
exit "$fail"
