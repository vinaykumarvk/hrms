#!/usr/bin/env bash
# PH-10E oracle: G14 UI, release conformance, manifest, and full regression.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-10E exit-criteria (analytics/release conformance) =="

bash docs/spec/pipeline/checks/ph-10a.sh && grn "PH-10A regression passed" || red "PH-10A regression failed"
bash docs/spec/pipeline/checks/ph-10b.sh && grn "PH-10B regression passed" || red "PH-10B regression failed"
bash docs/spec/pipeline/checks/ph-10c.sh && grn "PH-10C regression passed" || red "PH-10C regression failed"
bash docs/spec/pipeline/checks/ph-10d.sh && grn "PH-10D regression passed" || red "PH-10D regression failed"

need_file apps/web/src/modules/g14/AnalyticsWorkspace.tsx 1200
need_file apps/web/test/ph10-analytics-release.test.cjs 1800
need_file docs/spec/ph-10-verdict.md 2200

if rg -n "\\bany\\b|as any|console\\.log|localhost" apps/web >/tmp/ph10e-web-hygiene.log 2>&1; then
  red "PH-10E web hygiene failed"
  sed -n '1,80p' /tmp/ph10e-web-hygiene.log
else
  grn "PH-10E web hygiene scan clean"
fi

if npm run check && npm run web:check; then grn "full API/web checks passed"; else red "full API/web checks failed"; fi

for marker in G14 MART_REFRESH_IDEMPOTENT P02_SCOPE_FILTER MIGRATION_DRY_RUN UAT_ACCEPTANCE_PACK release readiness; do
  grep -q "$marker" docs/spec/ph-10-verdict.md 2>/dev/null && grn "verdict marker: $marker" || red "missing verdict marker: $marker"
done

python3 - <<'PY' && grn "manifest records PH-10 through PH-10E" || red "manifest missing PH-10 evidence"
import json, sys
phases = json.load(open("docs/spec/manifest.json")).get("phases", {})
for key in ["PH-10", "PH-10A", "PH-10B", "PH-10C", "PH-10D", "PH-10E"]:
    phase = phases.get(key)
    if not isinstance(phase, dict) or "status" not in phase or "tests" not in phase:
        sys.exit(1)
sys.exit(0)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-10E met' || echo 'RED - PH-10E not complete') =="
exit "$fail"
