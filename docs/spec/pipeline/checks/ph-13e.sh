#!/usr/bin/env bash
# PH-13E oracle: release-candidate seal conformance, manifest, and full regression.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-13E exit-criteria (release-candidate seal conformance) =="

bash docs/spec/pipeline/checks/ph-13a.sh && grn "PH-13A regression passed" || red "PH-13A regression failed"
bash docs/spec/pipeline/checks/ph-13b.sh && grn "PH-13B regression passed" || red "PH-13B regression failed"
bash docs/spec/pipeline/checks/ph-13c.sh && grn "PH-13C regression passed" || red "PH-13C regression failed"
bash docs/spec/pipeline/checks/ph-13d.sh && grn "PH-13D regression passed" || red "PH-13D regression failed"

need_file docs/spec/ph-13-verdict.md 2200

if npm run check && npm run web:check; then grn "full API/web checks passed"; else red "full API/web checks failed"; fi

for marker in PH-13 RELEASE_CANDIDATE_SEALED HUMAN_APPROVAL_INTAKE_PENDING EVIDENCE_ARCHIVE_READY GO_LIVE_HUMAN_APPROVAL_PENDING "release-candidate sealed"; do
  grep -q "$marker" docs/spec/ph-13-verdict.md 2>/dev/null && grn "verdict marker: $marker" || red "missing verdict marker: $marker"
done

python3 - <<'PY' && grn "manifest records PH-13 through PH-13E" || red "manifest missing PH-13 evidence"
import json, sys
phases = json.load(open("docs/spec/manifest.json")).get("phases", {})
for key in ["PH-13", "PH-13A", "PH-13B", "PH-13C", "PH-13D", "PH-13E"]:
    phase = phases.get(key)
    if not isinstance(phase, dict) or "status" not in phase or "tests" not in phase:
        sys.exit(1)
sys.exit(0)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-13E met' || echo 'RED - PH-13E not complete') =="
exit "$fail"

