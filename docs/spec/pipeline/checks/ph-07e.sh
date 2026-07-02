#!/usr/bin/env bash
# PH-07E oracle: employee wave UI, conformance, manifest, full regression.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-07E exit-criteria (employee wave conformance) =="

bash docs/spec/pipeline/checks/ph-07a.sh && grn "PH-07A regression passed" || red "PH-07A regression failed"
bash docs/spec/pipeline/checks/ph-07b.sh && grn "PH-07B regression passed" || red "PH-07B regression failed"
bash docs/spec/pipeline/checks/ph-07c.sh && grn "PH-07C regression passed" || red "PH-07C regression failed"
bash docs/spec/pipeline/checks/ph-07d.sh && grn "PH-07D regression passed" || red "PH-07D regression failed"

need_file apps/web/src/modules/g02/PersonalDetailsWorkspace.tsx 1000
need_file apps/web/src/modules/g04/LeaveSrRelayWorkspace.tsx 1000
need_file apps/web/test/ph07-employee-wave.test.cjs 1200
need_file docs/spec/ph-07-verdict.md 1200

if rg -n "\\bany\\b|as any|console\\.log|localhost" apps/web >/tmp/ph07e-web-hygiene.log 2>&1; then
  red "PH-07E web hygiene failed"
  sed -n '1,80p' /tmp/ph07e-web-hygiene.log
else
  grn "PH-07E web hygiene scan clean"
fi

if npm run check && npm run web:check; then grn "full API/web checks passed"; else red "full API/web checks failed"; fi

for marker in "G02" "G03" "G04" "G01" "READY_FOR_G10" "DLQ" "SR conformance"; do
  grep -q "$marker" docs/spec/ph-07-verdict.md 2>/dev/null && grn "verdict marker: $marker" || red "missing verdict marker: $marker"
done

python3 - <<'PY' && grn "manifest records PH-07 through PH-07E" || red "manifest missing PH-07 evidence"
import json, sys
phases = json.load(open("docs/spec/manifest.json")).get("phases", {})
for key in ["PH-07", "PH-07A", "PH-07B", "PH-07C", "PH-07D", "PH-07E"]:
    phase = phases.get(key)
    if not isinstance(phase, dict) or "status" not in phase or "tests" not in phase:
        sys.exit(1)
sys.exit(0)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-07E met' || echo 'RED - PH-07E not complete') =="
exit "$fail"
