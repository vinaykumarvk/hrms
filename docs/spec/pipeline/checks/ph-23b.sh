#!/usr/bin/env bash
# PH-23B oracle: G11 FR-24 DigiLocker / DBT delivery — digital_deliveries with a DigiLocker push
# channel + DBT credit status, delivery retry, DLQ on permanent failure.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g11 apps/api/src/routes/g11.routes.ts"; T=apps/api/test
echo "== PH-23B exit-criteria (G11 DigiLocker / DBT delivery) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "deliveries entity consumed (digital_deliveries)::digital_deliveries|digitalDeliver" \
  "DigiLocker channel::[Dd]igi.?[Ll]ocker|DIGILOCKER" \
  "DBT credit status::DBT|dbt" \
  "delivery status machine (DELIVERED)::DELIVERED|delivered"
do must "$spec" $S; done
for spec in \
  "delivery lifecycle exercised (digital_deliveries)::digital_deliveries|digitalDeliver|DigiLocker|DIGILOCKER" \
  "NEGATIVE: permanent failure dead-letters::DEAD_LETTER|FAILED|PRECONDITION_FAILED"
do must "$spec" "$T"/ph23b-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-23B met' || echo 'RED - PH-23B not complete') =="; exit "$fail"
