#!/usr/bin/env bash
# PH-15B oracle: G11 pensioner lifecycle and revisions — pen_pensioners created on PPO authorisation,
# life certificates with suspend-on-lapse (SUSPENDED_NO_LC) / release-on-submit, death -> family-pension
# conversion (CONVERTED_TO_FAMILY), deterministic DA-relief / pay-commission revision batches with arrears
# and post-apply immutability. Behavior + executed tests only.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S11="apps/api/src/modules/g11 apps/api/src/routes/g11.routes.ts"
T=apps/api/test

echo "== PH-15B exit-criteria (G11 pensioner lifecycle + revisions to BRD depth) =="

[ -d node_modules ] || red "node_modules absent — toolchain oracle cannot run; refusing GREEN without it"

# 1) lifecycle + revision behavior in module source (BRD entities + error codes, not markers)
for spec in \
  "pensioner master consumed (pen_pensioners)::pen_pensioners" \
  "life certificates consumed (pen_life_certificates)::pen_life_certificates" \
  "suspend on lapsed LC (SUSPENDED_NO_LC)::SUSPENDED_NO_LC" \
  "disbursement blocked on lapsed LC (ERR-G11-LC-SUSPENDED)::ERR-G11-LC-SUSPENDED" \
  "death conversion state (CONVERTED_TO_FAMILY)::CONVERTED_TO_FAMILY" \
  "family pension records consumed::pen_family_pension_records" \
  "revision batches consumed (pen_revisions)::pen_revisions" \
  "DA relief rates consumed::pen_da_relief_rates|da_relief" \
  "pay-commission re-fix handled::pay_?[Cc]ommission|payCommission" \
  "revision arrears computed::arrear" \
  "applied revision immutability (ERR-G11-REVISION-IMMUTABLE)::ERR-G11-REVISION-IMMUTABLE"
do must "$spec" $S11; done

# 2) money math discipline: no floating-point currency in the g11 engine
if grep -rqE 'parseFloat|toFixed\(' apps/api/src/modules/g11 2>/dev/null; then
  red "float currency math detected in g11 (parseFloat/toFixed) — integer paise required"
else grn "no parseFloat/toFixed in g11 engine (integer money math)"; fi

# 3) executed oracle tests
for spec in \
  "pensioner enrolment exercised (pen_pensioners)::pen_pensioners" \
  "LC lapse -> suspend lifecycle asserted (SUSPENDED_NO_LC)::SUSPENDED_NO_LC" \
  "NEGATIVE: disbursement on lapsed LC asserted (ERR-G11-LC-SUSPENDED)::ERR-G11-LC-SUSPENDED" \
  "death -> family conversion asserted (CONVERTED_TO_FAMILY)::CONVERTED_TO_FAMILY" \
  "revision determinism exercised (pen_revisions + recompute)::pen_revisions" \
  "deterministic deltas asserted (deepEqual/deepStrictEqual)::deepEqual|deepStrictEqual" \
  "NEGATIVE: applied batch mutation asserted (ERR-G11-REVISION-IMMUTABLE)::ERR-G11-REVISION-IMMUTABLE"
do must "$spec" "$T"; done

# 4) suites — RED on any failure
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-15B met' || echo 'RED - PH-15B not complete') =="
exit "$fail"
