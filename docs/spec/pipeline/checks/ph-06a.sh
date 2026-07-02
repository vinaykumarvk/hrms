#!/usr/bin/env bash
# PH-06A oracle: vertical-slice plan, contract binding, and pipeline wiring.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-06A exit-criteria (vertical-slice plan + pipeline wiring) =="

need_file docs/spec/ph-06-vertical-slice-implementation-plan.md 1200
need_file docs/spec/vertical-slice-g03-leave.yaml 700
need_file docs/spec/vertical-slice-g05-transfer.yaml 900
need_file docs/spec/pipeline/prompts/PH-06A.md 600
need_file docs/spec/pipeline/prompts/PH-06B.md 600
need_file docs/spec/pipeline/prompts/PH-06C.md 600
need_file docs/spec/pipeline/prompts/PH-06D.md 600
need_file docs/spec/pipeline/prompts/PH-06E.md 600

for marker in "REPORTING_CHAIN" "G04" "LEAVE_APPROVED" "P05" "X.2"; do
  grep -q "$marker" docs/spec/vertical-slice-g03-leave.yaml && grn "G03 marker: $marker" || red "missing G03 marker: $marker"
done
for marker in "POSITION_AUTHORITY" "PARALLEL_ALL_OF" "DEEMED_CLEARED" "TRANSFER_JOINED" "G13"; do
  grep -q "$marker" docs/spec/vertical-slice-g05-transfer.yaml && grn "G05 marker: $marker" || red "missing G05 marker: $marker"
done
grep -q "x-ph06-vertical-slice" docs/contracts/openapi/G03.yaml && grn "G03 OpenAPI PH-06 marker" || red "missing G03 OpenAPI PH-06 marker"
grep -q "x-ph06-vertical-slice" docs/contracts/openapi/G05.yaml && grn "G05 OpenAPI PH-06 marker" || red "missing G05 OpenAPI PH-06 marker"

python3 - <<'PY' && grn "pipeline wires PH-06A..PH-06E gates" || red "PH-06 pipeline wiring invalid"
import sys, yaml
phases = {p.get("id"): p for p in yaml.safe_load(open("docs/spec/pipeline/phases.yaml")).get("phases", [])}
expected = {
    "PH-06A": ("auto", ["PH-05E"]),
    "PH-06B": ("auto", ["PH-06A"]),
    "PH-06C": ("auto", ["PH-06B"]),
    "PH-06D": ("auto", ["PH-06C"]),
    "PH-06E": ("human", ["PH-06D"]),
}
for phase_id, (gate, deps) in expected.items():
    phase = phases.get(phase_id)
    if not phase or phase.get("gate") != gate or phase.get("depends_on") != deps:
        sys.exit(1)
sys.exit(0)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-06A met' || echo 'RED - PH-06A not complete') =="
exit "$fail"
