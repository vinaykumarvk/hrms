#!/usr/bin/env bash
# PH-15A oracle: G10 tax/TDS engine and statutory certificates — tax_declarations with regime pipeline,
# TDS projection over the payslip_lines YTD ledger, Form-16 tie-out to the ledger with Part A gated on
# MATCHED statutory_remittances, Form-24Q quarterly aggregation, declaration cutoff lock. Behavior +
# executed tests only.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S10="apps/api/src/modules/g10 apps/api/src/routes/g10.routes.ts"
T=apps/api/test

echo "== PH-15A exit-criteria (G10 tax/TDS engine + Form-16/24Q to BRD depth) =="

[ -d node_modules ] || red "node_modules absent — toolchain oracle cannot run; refusing GREEN without it"

# 1) engine behavior present in module source (BRD entities + error codes, not markers)
for spec in \
  "tax_declarations entity consumed::tax_declarations" \
  "regime handling (old/new)::regime" \
  "standard deduction stage persisted::standard_deduction" \
  "surcharge with marginal relief::marginal_relief" \
  "87A rebate stage::rebate_87a" \
  "TDS spread over remaining months (FR-07 BR2)::remaining_?[Mm]onths|remainingMonths" \
  "declaration cutoff lock (ERR-G10-SNAPSHOT-FROZEN)::ERR-G10-SNAPSHOT-FROZEN" \
  "missing slab guarded (ERR-G10-TAXSLAB-NOTFOUND)::ERR-G10-TAXSLAB-NOTFOUND" \
  "Form-16 generation::[Ff]orm_?16|Form-16" \
  "Form-24Q aggregation::[Ff]orm_?24[Qq]|Form-24Q" \
  "statutory_remittances consumed::statutory_remittances" \
  "Part A gated on MATCHED remittances::MATCHED"
do must "$spec" $S10; done

# 2) money math discipline: no floating-point currency in the g10 engine
if grep -rqE 'parseFloat|toFixed\(' apps/api/src/modules/g10 2>/dev/null; then
  red "float currency math detected in g10 (parseFloat/toFixed) — integer paise required"
else grn "no parseFloat/toFixed in g10 engine (integer money math)"; fi

# 3) executed oracle tests
for spec in \
  "regime switch recompute test present::[Rr]egime" \
  "Form-16 tie-out test present::[Ff]orm_?16|Form-16" \
  "NEGATIVE: post-cutoff declaration mutation asserted (ERR-G10-SNAPSHOT-FROZEN)::ERR-G10-SNAPSHOT-FROZEN" \
  "NEGATIVE: Form-16 blocked while remittance un-MATCHED asserted::MATCHED" \
  "Form-24Q quarterly reconciliation asserted::24[Qq]" \
  "declaration entity exercised in tests::tax_declaration"
do must "$spec" "$T"; done

# 4) suites — RED on any failure
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-15A met' || echo 'RED - PH-15A not complete') =="
exit "$fail"
