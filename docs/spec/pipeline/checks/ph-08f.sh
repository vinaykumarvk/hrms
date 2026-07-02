#!/usr/bin/env bash
# PH-08F oracle: statutory wave UI, conformance, manifest, full regression.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-08F exit-criteria (statutory wave conformance) =="

bash docs/spec/pipeline/checks/ph-08a.sh && grn "PH-08A regression passed" || red "PH-08A regression failed"
bash docs/spec/pipeline/checks/ph-08b.sh && grn "PH-08B regression passed" || red "PH-08B regression failed"
bash docs/spec/pipeline/checks/ph-08c.sh && grn "PH-08C regression passed" || red "PH-08C regression failed"
bash docs/spec/pipeline/checks/ph-08d.sh && grn "PH-08D regression passed" || red "PH-08D regression failed"
bash docs/spec/pipeline/checks/ph-08e.sh && grn "PH-08E regression passed" || red "PH-08E regression failed"

need_file apps/web/src/modules/g06/PromotionWorkspace.tsx 1000
need_file apps/web/src/modules/g07/TrainingWorkspace.tsx 900
need_file apps/web/src/modules/g08/AparWorkspace.tsx 1000
need_file apps/web/src/modules/g09/DisciplinaryWorkspace.tsx 1000
need_file apps/web/test/ph08-statutory-wave.test.cjs 1500
need_file docs/spec/ph-08-verdict.md 1500

if rg -n "\\bany\\b|as any|console\\.log|localhost" apps/web >/tmp/ph08f-web-hygiene.log 2>&1; then
  red "PH-08F web hygiene failed"
  sed -n '1,80p' /tmp/ph08f-web-hygiene.log
else
  grn "PH-08F web hygiene scan clean"
fi

if npm run check && npm run web:check; then grn "full API/web checks passed"; else red "full API/web checks failed"; fi

for marker in "G05" "G06" "G07" "G08" "G09" "DPC_QUORUM" "SEALED_COVER" "MAJOR_PENALTY" "SR conformance"; do
  grep -q "$marker" docs/spec/ph-08-verdict.md 2>/dev/null && grn "verdict marker: $marker" || red "missing verdict marker: $marker"
done

python3 - <<'PY' && grn "manifest records PH-08 through PH-08F" || red "manifest missing PH-08 evidence"
import json, sys
phases = json.load(open("docs/spec/manifest.json")).get("phases", {})
for key in ["PH-08", "PH-08A", "PH-08B", "PH-08C", "PH-08D", "PH-08E", "PH-08F"]:
    phase = phases.get(key)
    if not isinstance(phase, dict) or "status" not in phase or "tests" not in phase:
        sys.exit(1)
sys.exit(0)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-08F met' || echo 'RED - PH-08F not complete') =="
exit "$fail"
