#!/usr/bin/env bash
# Exit-criteria for PH-00B (thin PUDA strangler boundary). Independent oracle — run OUTSIDE the model.
# GREEN only if: the P01 contract artifacts parse, boundary conformance passes (through-facade delegates to
# direct PUDA ports for the four shapes) with a focused PUDA golden smoke still green, AND no code was extracted
# yet (that is PH-00C). The broader PUDA aggregate corpus remains a PH-00A caveat until isolated DB/config
# cleanup is complete.
#
# Boundary conformance:
#   - If PH00B_TEST_CMD is set, it must run and exit 0. This is required for any future gate:auto use.
#   - If PH00B_TEST_CMD is absent, docs/spec/ph-00b-conformance.md may support human review only. It can
#     return GREEN only while PH-00B is gate:human; the driver will then park for approval instead of advancing.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
PUDA="/Users/n15318/PUDA_workflow_engine"
WFP="/Users/n15318/workflow-platform"
PIN="cadf39739e6f27c17d44767ca61d1a362034ac64"
fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

phase_gate="$(
python3 - <<'PY' 2>/dev/null || true
import yaml
data=yaml.safe_load(open("docs/spec/pipeline/phases.yaml"))
for phase in data.get("phases", []):
    if phase.get("id") == "PH-00B":
        print(phase.get("gate", "human"))
        break
PY
)"
[ -n "$phase_gate" ] || phase_gate="unknown"

echo "== PH-00B exit-criteria =="
echo "  .. configured gate: $phase_gate"

if [ -z "${PH00B_TEST_CMD:-}" ] && [ -f docs/spec/pipeline/checks/ph-00b-conformance.sh ]; then
  PH00B_TEST_CMD="bash docs/spec/pipeline/checks/ph-00b-conformance.sh"
fi

# 1) P01 contract artifacts exist
need_file docs/spec/workflow-platform-contract.yaml 300
need_file docs/contracts/openapi/P01-workflow.yaml 500
need_file docs/spec/ph-00b-verdict.md 200

# 2) P01 OpenAPI parses as 3.x and every internal $ref resolves
if [ -f docs/contracts/openapi/P01-workflow.yaml ]; then
python3 - <<'PY' || red "P01-workflow.yaml invalid OpenAPI / unresolved \$ref"
import sys,yaml
try: d=yaml.safe_load(open("docs/contracts/openapi/P01-workflow.yaml"))
except Exception as e: print("  RED  P01 parse error:",e); sys.exit(1)
if not str(d.get("openapi","")).startswith("3."): print("  RED  not OpenAPI 3.x"); sys.exit(1)
refs=[];
def walk(o):
    if isinstance(o,dict):
        for k,v in o.items():
            if k=="$ref" and isinstance(v,str) and v.startswith("#/"): refs.append(v)
            else: walk(v)
    elif isinstance(o,list):
        [walk(x) for x in o]
walk(d)
bad=[]
for r in refs:
    cur=d
    for part in r[2:].split("/"):
        part=part.replace("~1","/").replace("~0","~")
        if isinstance(cur,dict) and part in cur: cur=cur[part]
        else: bad.append(r); break
if bad: print("  RED  unresolved $refs:",sorted(set(bad))[:5]); sys.exit(1)
print(f"  ok   P01 OpenAPI 3.x, {len(refs)} $refs all resolve"); sys.exit(0)
PY
fi

# 3) manifest.json records a structural PH-00B phase object
if [ -f docs/spec/manifest.json ]; then
  python3 - <<'PY' && grn "manifest.json contains structural PH-00B phase record" || red "manifest.json missing structural PH-00B phase record"
import json,sys
try:
    m=json.load(open("docs/spec/manifest.json"))
except Exception:
    sys.exit(1)
phase=m.get("phases",{}).get("PH-00B")
if not isinstance(phase, dict):
    sys.exit(1)
required={"status","gate_verdict","artifacts","tests"}
sys.exit(0 if required.issubset(phase.keys()) else 1)
PY
fi

# 4) Boundary conformance: executable command for auto; markdown evidence only for human-gated review
if [ -n "${PH00B_TEST_CMD:-}" ]; then
  echo "  .. running PH00B_TEST_CMD: $PH00B_TEST_CMD"
  if ( eval "$PH00B_TEST_CMD" ); then grn "boundary conformance test command passed"; else red "PH00B_TEST_CMD failed"; fi
else
  if [ -s docs/spec/ph-00b-conformance.md ]; then
    ok=1
    for shape in SIMPLE WAIT FORK_JOIN REFERENCE; do
      grep -qiE "$shape.*(PASS|GREEN|OK)" docs/spec/ph-00b-conformance.md || { red "conformance: $shape not marked PASS"; ok=0; }
    done
    grep -qiE "golden.*(GREEN|PASS)|PUDA.*(GREEN|green|still green)" docs/spec/ph-00b-conformance.md \
      || { red "conformance: PUDA golden suite not asserted GREEN"; ok=0; }
    if [ "$ok" = 1 ]; then
      if [ "$phase_gate" = "human" ]; then
        grn "markdown conformance evidence present for human review (PH-00B gate:human)"
      else
        red "markdown-only conformance cannot satisfy PH-00B while gate:$phase_gate; set PH00B_TEST_CMD"
      fi
    fi
  else
    red "no boundary proof — set PH00B_TEST_CMD or write docs/spec/ph-00b-conformance.md for human review"
  fi
fi

# 5) Scope guard: PH-00B itself must not extract code. After PH-00C is recorded, workflow-core is expected to exist.
ph00c_recorded="$(
python3 - <<'PY' 2>/dev/null || true
import json
try:
    phase=json.load(open("docs/spec/manifest.json")).get("phases",{}).get("PH-00C")
except Exception:
    phase=None
print("yes" if isinstance(phase, dict) else "no")
PY
)"
if [ -d "$WFP/packages/workflow-core" ] && find "$WFP/packages/workflow-core" -type f -name '*.ts' -print -quit 2>/dev/null | grep -q .; then
  if [ "$ph00c_recorded" = "yes" ]; then
    grn "workflow-core exists and PH-00C is recorded"
  else
    red "scope violation: workflow-core already contains .ts — extraction belongs to PH-00C, not PH-00B"
  fi
else
  grn "no premature extraction (workflow-core empty/absent)"
fi

# 6) PUDA must be pinned and unchanged in core behavior. A facade shim may be additive, but core runtime diffs fail.
if [ -d "$PUDA/.git" ]; then
  head="$(git -C "$PUDA" rev-parse HEAD 2>/dev/null || true)"
  if [ "$head" = "$PIN" ]; then
    grn "PUDA pinned commit ${PIN:0:12}"
  else
    red "PUDA HEAD is ${head:-unknown}, expected ${PIN:0:12}"
  fi
  if git -C "$PUDA" status --porcelain -- apps/api/src/workflow.ts apps/api/src/tasks.ts 2>/dev/null | grep -q .; then
    red "PUDA core workflow.ts/tasks.ts show local changes — freeze/clean before PH-00B conformance"
  else
    grn "PUDA core workflow files unmodified"
  fi
fi

echo "== $([ $fail -eq 0 ] && echo 'GREEN — PH-00B exit-criteria met' || echo 'RED — PH-00B not complete') =="
exit $fail
