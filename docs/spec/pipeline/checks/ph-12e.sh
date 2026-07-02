#!/usr/bin/env bash
# PH-12E oracle: release-board readiness conformance, manifest, and full regression.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-12E exit-criteria (release-board readiness conformance) =="

bash docs/spec/pipeline/checks/ph-12a.sh && grn "PH-12A regression passed" || red "PH-12A regression failed"
bash docs/spec/pipeline/checks/ph-12b.sh && grn "PH-12B regression passed" || red "PH-12B regression failed"
bash docs/spec/pipeline/checks/ph-12c.sh && grn "PH-12C regression passed" || red "PH-12C regression failed"
bash docs/spec/pipeline/checks/ph-12d.sh && grn "PH-12D regression passed" || red "PH-12D regression failed"

need_file docs/spec/ph-12-verdict.md 2200

if npm run check && npm run web:check; then grn "full API/web checks passed"; else red "full API/web checks failed"; fi

for marker in PH-12 RELEASE_BOARD_READY TARGET_ENVIRONMENT_READINESS_DRY_RUN GO_NO_GO_HUMAN_DECISION_REQUIRED GO_LIVE_HUMAN_APPROVAL_PENDING "release-board ready"; do
  grep -q "$marker" docs/spec/ph-12-verdict.md 2>/dev/null && grn "verdict marker: $marker" || red "missing verdict marker: $marker"
done

python3 - <<'PY' && grn "manifest records PH-12 through PH-12E" || red "manifest missing PH-12 evidence"
import json, sys
phases = json.load(open("docs/spec/manifest.json")).get("phases", {})
for key in ["PH-12", "PH-12A", "PH-12B", "PH-12C", "PH-12D", "PH-12E"]:
    phase = phases.get(key)
    if not isinstance(phase, dict) or "status" not in phase or "tests" not in phase:
        sys.exit(1)
sys.exit(0)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-12E met' || echo 'RED - PH-12E not complete') =="
exit "$fail"

