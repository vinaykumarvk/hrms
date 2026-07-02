#!/usr/bin/env bash
# PH-14A oracle: post-seal drift-watch plan and pipeline wiring.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-14A exit-criteria (post-seal drift-watch plan + pipeline wiring) =="

need_file docs/spec/ph-14-post-seal-drift-watch-plan.md 2500
for id in PH-14A PH-14B PH-14C PH-14D PH-14E; do
  need_file "docs/spec/pipeline/prompts/$id.md" 500
done

grep -q "id: PH-14" docs/spec/phased-plan.yaml && grn "docs/spec/phased-plan.yaml PH-14 entry" || red "missing PH-14 in phased-plan.yaml"
grep -q "PH-14 implementation evidence" docs/phased-plan.md && grn "docs/phased-plan.md PH-14 evidence note" || red "missing docs/phased-plan.md PH-14 evidence note"

python3 - <<'PY' && grn "pipeline wires PH-14A..PH-14E as auto gates" || red "PH-14 pipeline wiring invalid"
import sys, yaml
phases = {p.get("id"): p for p in yaml.safe_load(open("docs/spec/pipeline/phases.yaml")).get("phases", [])}
expected = {
    "PH-14A": ["PH-13E"],
    "PH-14B": ["PH-14A"],
    "PH-14C": ["PH-14B"],
    "PH-14D": ["PH-14C"],
    "PH-14E": ["PH-14D"],
}
for phase_id, deps in expected.items():
    phase = phases.get(phase_id)
    if not phase or phase.get("gate") != "auto" or phase.get("depends_on") != deps:
        sys.exit(1)
sys.exit(0)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-14A met' || echo 'RED - PH-14A not complete') =="
exit "$fail"

