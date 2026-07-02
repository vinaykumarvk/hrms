#!/usr/bin/env bash
# PH-07A oracle: employee wave plan, contract markers, and pipeline wiring.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-07A exit-criteria (employee wave plan + pipeline wiring) =="

need_file docs/spec/ph-07-employee-transaction-wave-plan.md 1000
for id in PH-07A PH-07B PH-07C PH-07D PH-07E; do
  need_file "docs/spec/pipeline/prompts/$id.md" 500
done

grep -q "x-ph07-employee-wave" docs/contracts/openapi/G02.yaml && grn "G02 OpenAPI PH-07 marker" || red "missing G02 PH-07 marker"
grep -q "x-ph07-employee-wave" docs/contracts/openapi/G03.yaml && grn "G03 OpenAPI PH-07 marker" || red "missing G03 PH-07 marker"
grep -q "x-ph07-employee-wave" docs/contracts/openapi/G04.yaml && grn "G04 OpenAPI PH-07 marker" || red "missing G04 PH-07 marker"

python3 - <<'PY' && grn "pipeline wires PH-07A..PH-07E as auto gates" || red "PH-07 pipeline wiring invalid"
import sys, yaml
phases = {p.get("id"): p for p in yaml.safe_load(open("docs/spec/pipeline/phases.yaml")).get("phases", [])}
expected = {
    "PH-07A": ["PH-06E"],
    "PH-07B": ["PH-07A"],
    "PH-07C": ["PH-07B"],
    "PH-07D": ["PH-07C"],
    "PH-07E": ["PH-07D"],
}
for phase_id, deps in expected.items():
    phase = phases.get(phase_id)
    if not phase or phase.get("gate") != "auto" or phase.get("depends_on") != deps:
        sys.exit(1)
sys.exit(0)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-07A met' || echo 'RED - PH-07A not complete') =="
exit "$fail"
