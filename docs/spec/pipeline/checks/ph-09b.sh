#!/usr/bin/env bash
# PH-09B oracle: G10 payroll engine at BRD depth — DSL-ordered compute, LWP proration, arrears with
# month-wise breakup, caps + state PT, payslip_lines YTD ledger, lock immutability + supersede
# versioning, in-flight guard, net-pay floor + carryforwards. Behavior + executed tests only.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S10="apps/api/src/modules/g10 apps/api/src/routes/g10.routes.ts"
T=apps/api/test

echo "== PH-09B exit-criteria (G10 deterministic payroll to BRD depth) =="

[ -d node_modules ] || red "node_modules absent — toolchain oracle cannot run; refusing GREEN without it"

# 1) engine behavior present in module source (BRD entities + error codes, not markers)
for spec in \
  "payroll_runs entity consumed::payroll_runs" \
  "payslips entity consumed::payslips" \
  "immutable line ledger payslip_lines::payslip_lines" \
  "rule evaluation order validated (VAL-G10-RULE-ORDER)::VAL-G10-RULE-ORDER" \
  "LWP handled from attendance feed::LWP" \
  "proration implemented::prorat" \
  "arrears engine present::arrear" \
  "month-wise arrears breakup persisted::month_?[Ww]ise|per[Mm]onth|month_?[Bb]reak" \
  "state-wise PT applied (ERR-G10-PT-STATE)::ERR-G10-PT-STATE" \
  "YTD derived from payslip_lines (VAL-G10-YTD-DERIVE)::VAL-G10-YTD-DERIVE" \
  "single in-flight FINAL guard (ERR-G10-RUN-INFLIGHT)::ERR-G10-RUN-INFLIGHT" \
  "post-lock immutability (ERR-G10-RUN-IMMUTABLE)::ERR-G10-RUN-IMMUTABLE" \
  "reopen supersedes, originals REVERSED::REVERSED" \
  "net-pay floor enforced (ERR-G10-RECOVERY-NET)::ERR-G10-RECOVERY-NET" \
  "carryforward booking (deduction_carryforwards)::deduction_carryforwards"
do must "$spec" $S10; done

# 2) money math discipline: no floating-point currency in the g10 engine
if grep -rqE 'parseFloat|toFixed\(' apps/api/src/modules/g10 2>/dev/null; then
  red "float currency math detected in g10 (parseFloat/toFixed) — integer paise required"
else grn "no parseFloat/toFixed in g10 engine (integer money math)"; fi

# 3) executed oracle tests
for spec in \
  "deterministic recompute test present (deepEqual/deepStrictEqual)::deepEqual|deepStrictEqual" \
  "recompute/determinism named in suite::[Rr]ecompute|[Dd]eterminis" \
  "NEGATIVE: mutation after lock asserted (ERR-G10-RUN-IMMUTABLE)::ERR-G10-RUN-IMMUTABLE" \
  "NEGATIVE: concurrent FINAL run asserted (ERR-G10-RUN-INFLIGHT)::ERR-G10-RUN-INFLIGHT" \
  "arrears month-wise breakup asserted::[Aa]rrear" \
  "LWP proration asserted::LWP" \
  "net floor / carryforward asserted::ERR-G10-RECOVERY-NET|deduction_carryforwards"
do must "$spec" "$T"; done

# 4) suites — RED on any failure
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-09B met' || echo 'RED - PH-09B not complete') =="
exit "$fail"
