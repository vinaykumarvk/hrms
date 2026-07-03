#!/usr/bin/env bash
# PH-20A oracle: G07 FR-019 vendor/external-trainer empanelment — vendor_empanelments status machine
# (APPLIED->EMPANELLED/REJECTED), requester != approver SoD, contract/procurement refs.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g07 apps/api/src/routes/g07.routes.ts"; T=apps/api/test
echo "== PH-20A exit-criteria (G07 vendor empanelment) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "empanelment entity consumed (vendor_empanelments)::vendor_empanelments|vendorEmpanelment" \
  "status machine (EMPANELLED)::EMPANELLED|EMPANELED" \
  "requester != approver SoD::SoD|requester|FORBIDDEN|approver" \
  "procurement / contract ref::contract|procurement|empanelment_ref|empanelmentRef"
do must "$spec" $S; done
for spec in \
  "empanelment lifecycle exercised::vendor_empanelments|vendorEmpanelment" \
  "NEGATIVE: self-approval SoD asserted::FORBIDDEN"
do must "$spec" "$T"/ph20a-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-20A met' || echo 'RED - PH-20A not complete') =="; exit "$fail"
