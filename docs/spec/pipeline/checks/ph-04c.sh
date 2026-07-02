#!/usr/bin/env bash
# PH-04C oracle: G12 Service Register and G13 document routes — asserts REAL build outcomes.
# Re-baselined 2026-07-02 after docs/reviews/brd-coverage-audit-20260702.md found: the G12
# timeline returns all events with next_cursor:null hardcoded (g12.routes.ts:83), the reversal
# path lacks the is_reversal envelope, and G13 has no :fetch?intent=VIEW|DOWNLOAD route
# (FR-G13-016) and attach does not validate target status (DI-14). This oracle asserts those
# behaviours with BRD identifiers and a green typecheck + test run. bash 3.2 / BSD grep compatible.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
echo "== PH-04C exit-criteria (G12 Service Register + G13 document routes) =="

# --- 1. Register-block analysis (paren-balanced parse; fail-closed on parser error) ---------------
python3 - <<'PY' > /tmp/ph04c-blocks.txt 2>&1
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
g12 = blocks("apps/api/src/routes/g12.routes.ts")
tl = find(g12, "/timeline")
check("G12 timeline route GET /api/v1/sr/employees/{id}/timeline present", tl is not None)
check("G12 timeline computes a real cursor (no hardcoded next_cursor: null)",
      bool(tl) and "next_cursor: null" not in (tl or "")
      and ("pageItems" in (tl or "") or "cursor" in (tl or "")))
rv = find(g12, "reversal")
check("G12 reversal route present with real handler", rv is not None and "services." in (rv or ""))
g13 = blocks("apps/api/src/routes/g13.routes.ts")
ft = find(g13, ":fetch")
check("G13 :fetch route registered (FR-G13-016 R2)", ft is not None)
at = find(g13, ":attach")
check("G13 :attach route delegates to service (DI-14 validation site)",
      at is not None and "services." in (at or ""))
PY
while IFS= read -r line; do
  case "$line" in
    PASS::*) grn "${line#PASS::}";;
    FAIL::*) red "${line#FAIL::}";;
    *) red "route-block parser error: $line";;
  esac
done < /tmp/ph04c-blocks.txt

# --- 2. FAIL-CLOSED: audit-flagged G12 timeline stub must be gone ---------------------------------
if grep -n 'next_cursor: null' apps/api/src/routes/g12.routes.ts 2>/dev/null | grep -q .; then
  red "hardcoded 'next_cursor: null' still present in g12.routes.ts (audit finding)"
else grn "no hardcoded next_cursor:null in g12.routes.ts"; fi

# --- 3. G12 reversal uses the BRD is_reversal envelope --------------------------------------------
g12src="apps/api/src/modules/g12"
grep -rq 'is_reversal' "$g12src" apps/api/src/routes/g12.routes.ts 2>/dev/null \
  && grn "reversal envelope field is_reversal consumed" || red "is_reversal envelope field not consumed (BRD G12 ingest/reversal)"
grep -rq 'reverses_source_reference_id' "$g12src" apps/api/src/routes/g12.routes.ts 2>/dev/null \
  && grn "reverses_source_reference_id linkage consumed" || red "reverses_source_reference_id not consumed"
grep -rq 'SR_REVERSAL_TARGET_NOT_FOUND' "$g12src" 2>/dev/null \
  && grn "SR_REVERSAL_TARGET_NOT_FOUND emitted for unknown reversal target" || red "SR_REVERSAL_TARGET_NOT_FOUND not emitted in $g12src"

# --- 4. G13 :fetch intent contract (FR-G13-016) ----------------------------------------------------
g13src="apps/api/src/modules/g13"
grep -rq 'intent' "$g13src" apps/api/src/routes/g13.routes.ts 2>/dev/null \
  && grn "fetch intent parameter handled" || red "fetch intent parameter not handled"
grep -rq 'VIEW' "$g13src" apps/api/src/routes/g13.routes.ts 2>/dev/null \
  && grep -rq 'DOWNLOAD' "$g13src" apps/api/src/routes/g13.routes.ts 2>/dev/null \
  && grn "intent=VIEW|DOWNLOAD branches present" || red "VIEW/DOWNLOAD intent branches missing"
grep -rq 'ERR-G13-FETCH_INTENT_REQUIRED' apps/api/src 2>/dev/null \
  && grn "ERR-G13-FETCH_INTENT_REQUIRED emitted when intent missing" || red "ERR-G13-FETCH_INTENT_REQUIRED not emitted"

# --- 5. G13 attach validates target status (DI-14: no DELETED/DISPOSED/ORPHANED attach) -----------
grep -rq 'ERR-G13-DOCUMENT_NOT_ATTACHABLE' apps/api/src 2>/dev/null \
  && grn "ERR-G13-DOCUMENT_NOT_ATTACHABLE emitted on invalid attach (DI-14)" || red "ERR-G13-DOCUMENT_NOT_ATTACHABLE not emitted (DI-14 unenforced)"
for st in DELETED DISPOSED ORPHANED; do
  grep -rq "$st" "$g13src" 2>/dev/null && grn "attach guard covers document status $st" || red "attach guard missing document status $st (DI-14)"
done

# --- 6. Behavioural tests exist AND the suite passes ----------------------------------------------
t=apps/api/test/ph04-g12-g13-routes.test.cjs
if [ -s "$t" ]; then
  grn "route behaviour test present: $t"
  grep -qE 'next_cursor|cursor' "$t" && grn "test exercises timeline cursor paging" || red "test does not exercise timeline cursor paging"
  grep -q 'is_reversal' "$t" && grn "test exercises is_reversal envelope" || red "test does not exercise is_reversal"
  grep -q 'intent' "$t" && grn "test exercises fetch intent contract" || red "test does not exercise fetch intent"
  grep -qE 'NOT_ATTACHABLE|DISPOSED' "$t" && grn "test exercises DI-14 attach rejection" || red "test does not exercise DI-14 attach rejection"
else red "missing route behaviour test: $t"; fi

# --- 7. Hygiene + toolchain (RED on fail; RED if deps absent — code phase) ------------------------
if grep -rn 'console\.log' apps/api/src/routes "$g12src" "$g13src" 2>/dev/null | grep -q .; then
  red "console.log in production src"; else grn "no console.log in routes/g12/g13 src"; fi
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm typecheck passes" || red "npm typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test passes (API suite)" || red "npm test failed"
else
  red "node_modules absent — PH-04C is a code phase; run npm install, then typecheck+test must pass"
fi

echo "== $([ $fail -eq 0 ] && echo 'GREEN — PH-04C met' || echo 'RED — PH-04C not complete') =="; exit $fail
