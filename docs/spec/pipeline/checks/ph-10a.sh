#!/usr/bin/env bash
# PH-10A oracle: analytics/release plan, contract marker, and pipeline wiring.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-10A exit-criteria (analytics/release plan + pipeline wiring) =="

need_file docs/spec/ph-10-analytics-hardening-release-plan.md 2500
for id in PH-10A PH-10B PH-10C PH-10D PH-10E; do
  need_file "docs/spec/pipeline/prompts/$id.md" 500
done

grep -q "x-ph10-release-analytics" docs/contracts/openapi/G14.yaml && grn "G14 OpenAPI PH-10 marker" || red "missing G14 PH-10 marker"
grep -q "PH-10 implementation evidence" docs/phased-plan.md && grn "docs/phased-plan.md PH-10 evidence note" || red "missing docs/phased-plan.md PH-10 evidence note"

python3 - <<'PY' && grn "pipeline wires PH-10A..PH-10E as auto gates" || red "PH-10 pipeline wiring invalid"
import sys, yaml
phases = {p.get("id"): p for p in yaml.safe_load(open("docs/spec/pipeline/phases.yaml")).get("phases", [])}
expected = {
    "PH-10A": ["PH-09E"],
    "PH-10B": ["PH-10A"],
    "PH-10C": ["PH-10B"],
    "PH-10D": ["PH-10C"],
    "PH-10E": ["PH-10D"],
}
for phase_id, deps in expected.items():
    phase = phases.get(phase_id)
    if not phase or phase.get("gate") != "auto" or phase.get("depends_on") != deps:
        sys.exit(1)
sys.exit(0)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-10A met' || echo 'RED - PH-10A not complete') =="
exit "$fail"
