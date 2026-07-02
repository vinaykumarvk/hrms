#!/usr/bin/env bash
# PH-14E oracle: post-seal drift-watch conformance, manifest, and full regression.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-14E exit-criteria (post-seal drift-watch conformance) =="

bash docs/spec/pipeline/checks/ph-14a.sh && grn "PH-14A regression passed" || red "PH-14A regression failed"
bash docs/spec/pipeline/checks/ph-14b.sh && grn "PH-14B regression passed" || red "PH-14B regression failed"
bash docs/spec/pipeline/checks/ph-14c.sh && grn "PH-14C regression passed" || red "PH-14C regression failed"
bash docs/spec/pipeline/checks/ph-14d.sh && grn "PH-14D regression passed" || red "PH-14D regression failed"

need_file docs/spec/ph-14-verdict.md 2200

if npm run check && npm run web:check; then grn "full API/web checks passed"; else red "full API/web checks failed"; fi

for marker in PH-14 POST_SEAL_DRIFT_WATCH DRIFT_STATUS_GREEN BOARD_DAY_READINESS_GREEN APPROVAL_EVIDENCE_QUARANTINE GO_LIVE_HUMAN_APPROVAL_PENDING; do
  grep -q "$marker" docs/spec/ph-14-verdict.md 2>/dev/null && grn "verdict marker: $marker" || red "missing verdict marker: $marker"
done

python3 - <<'PY' && grn "manifest records PH-14 through PH-14E" || red "manifest missing PH-14 evidence"
import json, sys
phases = json.load(open("docs/spec/manifest.json")).get("phases", {})
for key in ["PH-14", "PH-14A", "PH-14B", "PH-14C", "PH-14D", "PH-14E"]:
    phase = phases.get(key)
    if not isinstance(phase, dict) or "status" not in phase or "tests" not in phase:
        sys.exit(1)
sys.exit(0)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-14E met' || echo 'RED - PH-14E not complete') =="
exit "$fail"

