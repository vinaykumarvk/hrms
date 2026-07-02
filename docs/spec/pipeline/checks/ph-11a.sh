#!/usr/bin/env bash
# PH-11A oracle: UAT/cutover governance plan and pipeline wiring.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-11A exit-criteria (UAT/cutover governance plan + pipeline wiring) =="

need_file docs/spec/ph-11-uat-cutover-governance-plan.md 2500
for id in PH-11A PH-11B PH-11C PH-11D PH-11E; do
  need_file "docs/spec/pipeline/prompts/$id.md" 500
done

grep -q "id: PH-11" docs/spec/phased-plan.yaml && grn "docs/spec/phased-plan.yaml PH-11 entry" || red "missing PH-11 in phased-plan.yaml"
grep -q "PH-11 implementation evidence" docs/phased-plan.md && grn "docs/phased-plan.md PH-11 evidence note" || red "missing docs/phased-plan.md PH-11 evidence note"

python3 - <<'PY' && grn "pipeline wires PH-11A..PH-11E as auto gates" || red "PH-11 pipeline wiring invalid"
import sys, yaml
phases = {p.get("id"): p for p in yaml.safe_load(open("docs/spec/pipeline/phases.yaml")).get("phases", [])}
expected = {
    "PH-11A": ["PH-10E"],
    "PH-11B": ["PH-11A"],
    "PH-11C": ["PH-11B"],
    "PH-11D": ["PH-11C"],
    "PH-11E": ["PH-11D"],
}
for phase_id, deps in expected.items():
    phase = phases.get(phase_id)
    if not phase or phase.get("gate") != "auto" or phase.get("depends_on") != deps:
        sys.exit(1)
sys.exit(0)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-11A met' || echo 'RED - PH-11A not complete') =="
exit "$fail"
