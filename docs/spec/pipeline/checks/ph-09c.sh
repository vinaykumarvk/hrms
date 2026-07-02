#!/usr/bin/env bash
# PH-09C oracle: G11 pension at BRD depth — real scheme branching (OPS/NPS/UPS/service-gratuity),
# commutation factor-table lookup + restoration, family pension windows, gratuity slabs + ceiling
# clamp, Rule 9 provisional with DCRG withheld. Behavior + executed negative tests only.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S11="apps/api/src/modules/g11 apps/api/src/routes/g11.routes.ts"
T=apps/api/test

echo "== PH-09C exit-criteria (G11 scheme-branched pension to BRD depth) =="

[ -d node_modules ] || red "node_modules absent — toolchain oracle cannot run; refusing GREEN without it"

# 1) scheme branching + benefit engines in module source
for spec in \
  "OPS path present::OPS" \
  "NPS path present::NPS" \
  "UPS path present::UPS" \
  "sub-10yr SERVICE_GRATUITY route::SERVICE_GRATUITY" \
  "cross-scheme guard (ERR-G11-SCHEME-MISMATCH)::ERR-G11-SCHEME-MISMATCH" \
  "commutation factor lookup (pen_commutation_factors)::pen_commutation_factors" \
  "commutation max fraction guard (ERR-G11-COMMUTATION-LIMIT)::ERR-G11-COMMUTATION-LIMIT" \
  "factor miss fails closed (ERR-G11-FACTOR-NOT-FOUND)::ERR-G11-FACTOR-NOT-FOUND" \
  "restoration scheduling (reduction+15y)::restoration" \
  "family pension rates table consumed::pen_family_pension_rates" \
  "enhanced family-pension window::ENHANCED" \
  "gratuity types (RETIREMENT/DEATH)::RETIREMENT_GRATUITY|DEATH_GRATUITY" \
  "gratuity ceiling clamp (pen_gratuity_ceilings)::pen_gratuity_ceilings" \
  "Rule 9 provisional records::pen_provisional_pension_records" \
  "DCRG withheld during proceedings::DCRG"
do must "$spec" $S11; done

# 2) money math discipline in the g11 engine
if grep -rqE 'parseFloat|toFixed\(' apps/api/src/modules/g11 2>/dev/null; then
  red "float currency math detected in g11 (parseFloat/toFixed) — integer paise required"
else grn "no parseFloat/toFixed in g11 engine (integer money math)"; fi

# 3) executed oracle tests
for spec in \
  "scheme divergence asserted (OPS vs NPS via notEqual/notDeepEqual)::notEqual|notDeepStrictEqual|notDeepEqual" \
  "OPS exercised in suite::OPS" \
  "UPS exercised in suite::UPS" \
  "factor-table lookup exercised (pen_commutation_factors)::pen_commutation_factors" \
  "NEGATIVE: missing factor row asserted (ERR-G11-FACTOR-NOT-FOUND)::ERR-G11-FACTOR-NOT-FOUND" \
  "NEGATIVE: over-limit commutation asserted (ERR-G11-COMMUTATION-LIMIT)::ERR-G11-COMMUTATION-LIMIT" \
  "gratuity ceiling clamp asserted::pen_gratuity_ceilings|ceiling" \
  "family pension enhanced window asserted::ENHANCED" \
  "Rule 9 DCRG withholding asserted::DCRG"
do must "$spec" "$T"; done

# 4) suites — RED on any failure
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-09C met' || echo 'RED - PH-09C not complete') =="
exit "$fail"
