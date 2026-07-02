#!/usr/bin/env bash
# PH-11E oracle: UAT/cutover governance conformance, manifest, and full regression.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-11E exit-criteria (UAT/cutover governance conformance) =="

bash docs/spec/pipeline/checks/ph-11a.sh && grn "PH-11A regression passed" || red "PH-11A regression failed"
bash docs/spec/pipeline/checks/ph-11b.sh && grn "PH-11B regression passed" || red "PH-11B regression failed"
bash docs/spec/pipeline/checks/ph-11c.sh && grn "PH-11C regression passed" || red "PH-11C regression failed"
bash docs/spec/pipeline/checks/ph-11d.sh && grn "PH-11D regression passed" || red "PH-11D regression failed"

need_file docs/spec/ph-11-verdict.md 2200

if npm run check && npm run web:check; then grn "full API/web checks passed"; else red "full API/web checks failed"; fi

for marker in PH-11 UAT_EXECUTION_REHEARSAL CUTOVER_REHEARSAL_COMPLETED SUPPORT_HANDOFF GO_LIVE_HUMAN_APPROVAL_PENDING governance rehearsal; do
  grep -q "$marker" docs/spec/ph-11-verdict.md 2>/dev/null && grn "verdict marker: $marker" || red "missing verdict marker: $marker"
done

python3 - <<'PY' && grn "manifest records PH-11 through PH-11E" || red "manifest missing PH-11 evidence"
import json, sys
phases = json.load(open("docs/spec/manifest.json")).get("phases", {})
for key in ["PH-11", "PH-11A", "PH-11B", "PH-11C", "PH-11D", "PH-11E"]:
    phase = phases.get(key)
    if not isinstance(phase, dict) or "status" not in phase or "tests" not in phase:
        sys.exit(1)
sys.exit(0)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-11E met' || echo 'RED - PH-11E not complete') =="
exit "$fail"
