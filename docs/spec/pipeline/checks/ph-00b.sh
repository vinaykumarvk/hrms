#!/usr/bin/env bash
# Exit-criteria for PH-00B (thin PUDA strangler boundary). Independent oracle — run OUTSIDE the model.
# GREEN only if: the P01 contract artifacts parse, boundary conformance passes (through-facade == direct-PUDA
# for the four shapes) with the PUDA golden suite still green, AND no code was extracted yet (that is PH-00C).
#
# Boundary conformance is proven one of two ways:
#   (a) set PH00B_TEST_CMD to the real test command (e.g. the PUDA boundary test); it must exit 0; OR
#   (b) the phase writes docs/spec/ph-00b-conformance.md asserting each shape PASS + the PUDA golden suite GREEN.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
PUDA="/Users/n15318/PUDA_workflow_engine"
WFP="/Users/n15318/workflow-platform"
fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-00B exit-criteria =="

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

# 3) manifest.json references PH-00B
if [ -f docs/spec/manifest.json ]; then
  python3 - <<'PY' && grn "manifest.json references PH-00B" || red "manifest.json missing PH-00B"
import json,sys
try: m=json.load(open("docs/spec/manifest.json"))
except Exception: sys.exit(1)
sys.exit(0 if "PH-00B" in json.dumps(m) else 1)
PY
fi

# 4) Boundary conformance: real command if provided, else the evidence file with all four shapes + golden green
if [ -n "${PH00B_TEST_CMD:-}" ]; then
  echo "  .. running PH00B_TEST_CMD: $PH00B_TEST_CMD"
  if ( eval "$PH00B_TEST_CMD" >/dev/null 2>&1 ); then grn "boundary conformance test command passed"; else red "PH00B_TEST_CMD failed"; fi
else
  if [ -s docs/spec/ph-00b-conformance.md ]; then
    ok=1
    for shape in SIMPLE WAIT FORK_JOIN REFERENCE; do
      grep -qiE "$shape.*(PASS|GREEN|OK)" docs/spec/ph-00b-conformance.md || { red "conformance: $shape not marked PASS"; ok=0; }
    done
    grep -qiE "golden.*(GREEN|PASS)|PUDA.*(GREEN|green|still green)" docs/spec/ph-00b-conformance.md \
      || { red "conformance: PUDA golden suite not asserted GREEN"; ok=0; }
    [ "$ok" = 1 ] && grn "boundary conformance evidence: 4 shapes PASS + PUDA golden GREEN"
  else
    red "no boundary proof — set PH00B_TEST_CMD or write docs/spec/ph-00b-conformance.md"
  fi
fi

# 5) Scope guard: PH-00B must NOT extract code into the shared package yet (that is PH-00C)
if [ -d "$WFP/packages/workflow-core" ] && ls "$WFP/packages/workflow-core"/**/*.ts >/dev/null 2>&1; then
  red "scope violation: workflow-core already contains .ts — extraction belongs to PH-00C, not PH-00B"
else
  grn "no premature extraction (workflow-core empty/absent)"
fi

# 6) PUDA must be unchanged in behavior — reminder check: PUDA repo has no uncommitted diffs to workflow runtime
if [ -d "$PUDA/.git" ]; then
  if git -C "$PUDA" status --porcelain -- apps/api/src/workflow.ts apps/api/src/tasks.ts 2>/dev/null | grep -q .; then
    echo "  WARN PUDA workflow.ts/tasks.ts show local changes — confirm the facade is additive, not behavioral."
  else
    grn "PUDA core workflow files unmodified"
  fi
fi

echo "== $([ $fail -eq 0 ] && echo 'GREEN — PH-00B exit-criteria met' || echo 'RED — PH-00B not complete') =="
exit $fail
