#!/usr/bin/env bash
# PH-12A oracle: release-board readiness plan and pipeline wiring.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-12A exit-criteria (release-board readiness plan + pipeline wiring) =="

need_file docs/spec/ph-12-release-board-readiness-plan.md 2500
for id in PH-12A PH-12B PH-12C PH-12D PH-12E; do
  need_file "docs/spec/pipeline/prompts/$id.md" 500
done

grep -q "id: PH-12" docs/spec/phased-plan.yaml && grn "docs/spec/phased-plan.yaml PH-12 entry" || red "missing PH-12 in phased-plan.yaml"
grep -q "PH-12 implementation evidence" docs/phased-plan.md && grn "docs/phased-plan.md PH-12 evidence note" || red "missing docs/phased-plan.md PH-12 evidence note"

python3 - <<'PY' && grn "pipeline wires PH-12A..PH-12E as auto gates" || red "PH-12 pipeline wiring invalid"
import sys, yaml
phases = {p.get("id"): p for p in yaml.safe_load(open("docs/spec/pipeline/phases.yaml")).get("phases", [])}
expected = {
    "PH-12A": ["PH-11E"],
    "PH-12B": ["PH-12A"],
    "PH-12C": ["PH-12B"],
    "PH-12D": ["PH-12C"],
    "PH-12E": ["PH-12D"],
}
for phase_id, deps in expected.items():
    phase = phases.get(phase_id)
    if not phase or phase.get("gate") != "auto" or phase.get("depends_on") != deps:
        sys.exit(1)
sys.exit(0)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-12A met' || echo 'RED - PH-12A not complete') =="
exit "$fail"

