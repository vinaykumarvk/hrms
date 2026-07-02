#!/usr/bin/env bash
# PH-06E oracle: full vertical-slice conformance and scale-up review packet.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-06E exit-criteria (full PH-06 conformance + scale-up gate) =="

bash docs/spec/pipeline/checks/ph-06a.sh && grn "PH-06A regression passed" || red "PH-06A regression failed"
bash docs/spec/pipeline/checks/ph-06b.sh && grn "PH-06B regression passed" || red "PH-06B regression failed"
bash docs/spec/pipeline/checks/ph-06c.sh && grn "PH-06C regression passed" || red "PH-06C regression failed"
bash docs/spec/pipeline/checks/ph-06d.sh && grn "PH-06D regression passed" || red "PH-06D regression failed"

need_file apps/api/test/ph06-vertical-slice-conformance.test.cjs 1000
need_file docs/spec/ph-06-verdict.md 1400

if npm run check && npm run web:check && node --test apps/api/test/ph06-vertical-slice-conformance.test.cjs; then
  grn "full API/web/conformance tests passed"
else
  red "full API/web/conformance tests failed"
fi

for marker in "scale module build" "G03" "G05" "REPORTING_CHAIN" "POSITION_AUTHORITY" "G04" "G12" "G13" "human gate"; do
  grep -qi "$marker" docs/spec/ph-06-verdict.md 2>/dev/null && grn "verdict marker: $marker" || red "missing verdict marker: $marker"
done

python3 - <<'PY' && grn "manifest records PH-06 through PH-06E" || red "manifest missing PH-06 evidence"
import json, sys
phases = json.load(open("docs/spec/manifest.json")).get("phases", {})
required = ["PH-06", "PH-06A", "PH-06B", "PH-06C", "PH-06D", "PH-06E"]
for key in required:
    phase = phases.get(key)
    if not isinstance(phase, dict) or "status" not in phase or "tests" not in phase:
        sys.exit(1)
sys.exit(0)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-06E met; human scale-up gate pending' || echo 'RED - PH-06E not complete') =="
exit "$fail"
