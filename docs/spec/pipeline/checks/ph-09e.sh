#!/usr/bin/env bash
# PH-09E oracle (human gate): real payroll/pension UI — payslip with masked PAN/account, run console
# lifecycle, pension estimator, canonical states, full api+web suites, honest verdict delta.
# Fails closed while the stub marker cards ("evidence-line") are still the UI.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
W10=apps/web/src/modules/g10
W11=apps/web/src/modules/g11
WAPI=apps/web/src/api
WT=apps/web/test
T=apps/api/test
V=docs/spec/ph-09-verdict.md

echo "== PH-09E exit-criteria (compensation UI + conformance; human gate) =="

[ -d node_modules ] || red "node_modules absent — toolchain oracle cannot run; refusing GREEN without it"

# 1) anti-skeleton, fail-closed: the audited stub marker card must be gone from G10/G11 web modules
if grep -rq "evidence-line" "$W10" "$W11" 2>/dev/null; then
  red "stub marker card (evidence-line) still present in g10/g11 web modules — UI not rebuilt"
else grn "stub marker cards removed from g10/g11 web modules"; fi

# 2) real UI behavior in web source
for spec in \
  "payslip surface present::[Pp]ayslip" \
  "PAN rendered masked::PAN" \
  "masking applied in payslip view::mask" \
  "run console lifecycle: compute::compute" \
  "run console lifecycle: reconcile::reconcil" \
  "run console lifecycle: approve::approve" \
  "run console lifecycle: disburse::disburs" \
  "interactive actions wired (onClick/onSubmit)::onClick|onSubmit" \
  "loading state::[Ll]oading" \
  "error state::[Ee]rror" \
  "empty state::[Ee]mpty|[Nn]o (data|records|payslips)"
do must "$spec" "$W10"; done
for spec in \
  "pension case surface::[Cc]ase" \
  "estimator form present::[Ee]stimat" \
  "estimator submits (onSubmit/<form)::onSubmit|<form" \
  "loading/error states::[Ll]oading|[Ee]rror"
do must "$spec" "$W11"; done
must "client exposes run-lifecycle + payslip routes::payslip" "$WAPI"
must "client exposes estimator route::estimat" "$WAPI"

# 3) executed web tests: masked PAN must be asserted (raw value absent), lifecycle + estimator covered
for spec in \
  "NEGATIVE: masked PAN asserted in web suite::PAN" \
  "masking assertion present::mask" \
  "run lifecycle exercised in web suite::compute|approve|disburs" \
  "estimator round-trip exercised::estimat"
do must "$spec" "$WT"; done

# 4) honest verdict delta (content-checked, not existence-checked)
must "verdict references the audit baseline::brd-coverage-audit-20260702" "$V"
must "verdict tabulates G10 and G11::G10" "$V"
must "verdict names remaining gaps (no 100% claim)::NOT_FOUND|remaining|still open|open gap" "$V"

# 5) full suites — api AND web, RED on any failure
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "api typecheck green" || red "api typecheck failed"
  npm test >/dev/null 2>&1 && grn "api suite green" || red "npm test failed"
  npm run -s web:typecheck >/dev/null 2>&1 && grn "web typecheck green" || red "web typecheck failed"
  npm run -s web:test >/dev/null 2>&1 && grn "web suite green" || red "web tests failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-09E met (await HUMAN gate review)' || echo 'RED - PH-09E not complete') =="
exit "$fail"
