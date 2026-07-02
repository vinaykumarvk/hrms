#!/usr/bin/env bash
# PH-09E oracle: compensation wave UI, conformance, manifest, and full regression.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-09E exit-criteria (payroll/pension conformance) =="

bash docs/spec/pipeline/checks/ph-09a.sh && grn "PH-09A regression passed" || red "PH-09A regression failed"
bash docs/spec/pipeline/checks/ph-09b.sh && grn "PH-09B regression passed" || red "PH-09B regression failed"
bash docs/spec/pipeline/checks/ph-09c.sh && grn "PH-09C regression passed" || red "PH-09C regression failed"
bash docs/spec/pipeline/checks/ph-09d.sh && grn "PH-09D regression passed" || red "PH-09D regression failed"

need_file apps/web/src/modules/g10/PayrollWorkspace.tsx 1000
need_file apps/web/src/modules/g11/PensionWorkspace.tsx 1000
need_file apps/web/test/ph09-compensation-wave.test.cjs 1500
need_file docs/spec/ph-09-verdict.md 1800

if rg -n "\\bany\\b|as any|console\\.log|localhost" apps/web >/tmp/ph09e-web-hygiene.log 2>&1; then
  red "PH-09E web hygiene failed"
  sed -n '1,80p' /tmp/ph09e-web-hygiene.log
else
  grn "PH-09E web hygiene scan clean"
fi

if npm run check && npm run web:check; then grn "full API/web checks passed"; else red "full API/web checks failed"; fi

for marker in G10 G11 PAYROLL_TRACE RULE_VERSION_SNAPSHOT SR_VERIFICATION_GATE PPO_ISSUED SR conformance; do
  grep -q "$marker" docs/spec/ph-09-verdict.md 2>/dev/null && grn "verdict marker: $marker" || red "missing verdict marker: $marker"
done

python3 - <<'PY' && grn "manifest records PH-09 through PH-09E" || red "manifest missing PH-09 evidence"
import json, sys
phases = json.load(open("docs/spec/manifest.json")).get("phases", {})
for key in ["PH-09", "PH-09A", "PH-09B", "PH-09C", "PH-09D", "PH-09E"]:
    phase = phases.get(key)
    if not isinstance(phase, dict) or "status" not in phase or "tests" not in phase:
        sys.exit(1)
sys.exit(0)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-09E met' || echo 'RED - PH-09E not complete') =="
exit "$fail"
