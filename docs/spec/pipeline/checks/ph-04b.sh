#!/usr/bin/env bash
# PH-04B oracle: P01 workflow and G01 employee routes — asserts REAL build outcomes.
# Re-baselined 2026-07-02 after docs/reviews/brd-coverage-audit-20260702.md found: no employee
# CREATE (only reads), governed-change approve/reject are echo stubs (decision echoed, no service
# call), /changes feed hardcoded to items: [], no outbox. This oracle parses the register() blocks
# and asserts the handlers call real services, plus BRD identifiers (FR-EPM-001: PROFILE_CREATED
# via outbox, ERR-G01-* codes) and a green typecheck + test run. bash 3.2 / BSD grep compatible.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
echo "== PH-04B exit-criteria (P01 workflow + G01 employee routes) =="

# --- 1. Register-block analysis (paren-balanced parse; fail-closed on parser error) ---------------
python3 - <<'PY' > /tmp/ph04b-blocks.txt 2>&1
import re
def blocks(path):
    try:
        src = open(path).read()
    except Exception:
        print("FAIL::cannot read %s" % path); return []
    out = []
    for m in re.finditer(r'kernel\.register\(', src):
        i = m.end(); depth = 1
        while i < len(src) and depth > 0:
            c = src[i]
            if c == '(': depth += 1
            elif c == ')': depth -= 1
            i += 1
        out.append(src[m.end():i])
    return out
def find(bs, *needles):
    for b in bs:
        if all(n in b for n in needles): return b
    return None
def check(label, cond):
    print(("PASS::" if cond else "FAIL::") + label)
g01 = blocks("apps/api/src/routes/g01.routes.ts")
b = find(g01, '"POST"', 'path: "/api/v1/employees"')
check("G01 employee CREATE route POST /api/v1/employees (FR-EPM-001)", b is not None)
check("employee CREATE handler calls the module service (not an echo)", bool(b) and "services." in (b or ""))
ch = find(g01, '"/api/v1/employees/changes"')
check("GET /api/v1/employees/changes feed route present", ch is not None)
check("/changes feed backed by a real outbox/service read (not hardcoded [])",
      bool(ch) and "services." in (ch or "") and "items: []" not in (ch or ""))
gc = find(g01, '{id}/governed-changes"', '"GET"')
check("governed-changes list backed by a real service read (not hardcoded [])",
      bool(gc) and "services." in (gc or "") and "items: []" not in (gc or ""))
ap = find(g01, ':approve')
check("governed-change :approve invokes service decision logic", bool(ap) and "services." in (ap or ""))
rj = find(g01, ':reject')
check("governed-change :reject invokes service decision logic", bool(rj) and "services." in (rj or ""))
p01 = blocks("apps/api/src/routes/p01-workflow.routes.ts")
for action in ("claim", "approve", "reject", "delegate"):
    t = find(p01, "/api/v1/workflow/tasks/", action)
    check("workflow task action route with real handler: %s" % action,
          t is not None and "services." in (t or ""))
PY
while IFS= read -r line; do
  case "$line" in
    PASS::*) grn "${line#PASS::}";;
    FAIL::*) red "${line#FAIL::}";;
    *) red "route-block parser error: $line";;
  esac
done < /tmp/ph04b-blocks.txt

# --- 2. FAIL-CLOSED: audit-flagged stub patterns must be gone -------------------------------------
if grep -n 'items: \[\]' apps/api/src/routes/g01.routes.ts 2>/dev/null | grep -q .; then
  red "hardcoded empty feed 'items: []' still present in g01.routes.ts"
else grn "no hardcoded empty feed in g01.routes.ts"; fi
if grep -nE 'decision: "(APPROVED|REJECTED)" \}\)' apps/api/src/routes/g01.routes.ts 2>/dev/null | grep -q .; then
  red "approve/reject echo stub (bare decision echo) still present in g01.routes.ts"
else grn "no approve/reject echo stub in g01.routes.ts"; fi

# --- 3. G01 module implements the BRD behaviours behind the routes --------------------------------
m=apps/api/src/modules/g01
grep -rq 'PROFILE_CREATED' "$m" 2>/dev/null && grn "PROFILE_CREATED event emitted on create (FR-EPM-001 AC6)" || red "PROFILE_CREATED event not emitted in $m"
grep -rqi 'outbox' "$m" 2>/dev/null && grn "outbox backing for the changes feed exists" || red "no outbox in $m — /changes feed cannot be outbox-backed"
grep -rqiE 'service_?no' "$m" 2>/dev/null && grn "service_no handling present (FR-EPM-001 AC2)" || red "no service_no generation/handling in $m"
grep -rq 'APPROVED' "$m" 2>/dev/null && grep -rq 'REJECTED' "$m" 2>/dev/null \
  && grn "governed-change decision states implemented in service" || red "governed-change APPROVED/REJECTED states not implemented in $m"
grep -rq 'serviceRegister' "$m" apps/api/src/routes/g01.routes.ts 2>/dev/null \
  && grn "approved governed change posts to G12 service register" || red "no G12 SR posting from G01 governed-change path"
grep -rqE 'ERR-G01-' "$m" 2>/dev/null && grn "registered ERR-G01-* taxonomy code emitted in module src" || red "no ERR-G01-* code emitted (taxonomy unused)"

# --- 4. Behavioural tests exist AND the suite passes ----------------------------------------------
t=apps/api/test/ph04-p01-g01-routes.test.cjs
if [ -s "$t" ]; then
  grn "route behaviour test present: $t"
  grep -qE '"/api/v1/employees"|POST.*employees' "$t" && grn "test exercises employee CREATE" || red "test does not exercise employee CREATE"
  grep -q ':approve' "$t" && grn "test exercises governed-change approve" || red "test does not exercise governed-change approve"
  grep -qi 'claim' "$t" && grn "test exercises workflow task claim" || red "test does not exercise workflow task claim"
  grep -qE 'changes' "$t" && grn "test exercises the /changes feed" || red "test does not exercise the /changes feed"
else red "missing route behaviour test: $t"; fi

# --- 5. Hygiene + toolchain (RED on fail; RED if deps absent — code phase) ------------------------
if grep -rn 'console\.log' apps/api/src/routes apps/api/src/modules/g01 2>/dev/null | grep -q .; then
  red "console.log in production src"; else grn "no console.log in routes/g01 src"; fi
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm typecheck passes" || red "npm typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test passes (API suite)" || red "npm test failed"
else
  red "node_modules absent — PH-04B is a code phase; run npm install, then typecheck+test must pass"
fi

echo "== $([ $fail -eq 0 ] && echo 'GREEN — PH-04B met' || echo 'RED — PH-04B not complete') =="; exit $fail
