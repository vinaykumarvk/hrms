#!/usr/bin/env bash
# PH-10B oracle: G14 read-only analytics.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-10B exit-criteria (G14 analytics) =="

need_file apps/api/src/modules/g14/analyticsService.ts 5000
need_file apps/api/src/routes/g14.routes.ts 2000
need_file apps/api/test/ph10-g14-analytics.test.cjs 3000

for marker in G14_READ_ONLY MART_REFRESH_IDEMPOTENT P02_SCOPE_FILTER DRILL_THROUGH_AUTHZ ANALYTICS_READ_AUDITED PII_SUPPRESSION; do
  rg -q "$marker" apps/api/src/modules/g14 apps/api/src/routes/g14.routes.ts apps/api/test/ph10-g14-analytics.test.cjs && grn "G14 marker: $marker" || red "missing G14 marker: $marker"
done

if npm run build && node --test apps/api/test/ph10-g14-analytics.test.cjs; then
  grn "PH-10B G14 tests passed"
else
  red "PH-10B G14 tests failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-10B met' || echo 'RED - PH-10B not complete') =="
exit "$fail"
