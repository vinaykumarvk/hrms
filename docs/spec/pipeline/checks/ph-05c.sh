#!/usr/bin/env bash
# PH-05C oracle: workflow inbox and task action UI — asserts REAL build outcomes.
# Re-baselined 2026-07-02 after docs/reviews/brd-coverage-audit-20260702.md found the workflow
# UI is static markup: no <form>, actions dispatched via a window CustomEvent hack, no API call,
# no loading/error states. This oracle asserts: real forms with submit handlers calling the API
# client, a mandatory comment/reason field, loading/empty/error branches in the inbox, and green
# toolchains. bash 3.2 / BSD grep compatible.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
wf=apps/web/src/workflow
echo "== PH-05C exit-criteria (workflow inbox + task action UI) =="

# --- 1. Real forms with submit handlers -------------------------------------------------------------
if grep -rn '<form' "$wf" 2>/dev/null | grep -q .; then grn "real <form> markup in workflow UI"
else red "no <form> in $wf — task actions are not real forms"; fi
grep -rq 'onSubmit' "$wf" 2>/dev/null && grn "form submit handler wired" || red "no onSubmit handler in workflow UI"
if grep -rnE 'reason|comment' "$wf" 2>/dev/null | grep -q .; then grn "comment/reason field present"
else red "no comment/reason field in task action form"; fi
grep -rqiE 'required|mandatory' "$wf" 2>/dev/null && grn "mandatory comment validation present" || red "comment field not enforced as mandatory"

# --- 2. Submit handlers call the API client (not a window event hack) -------------------------------
if grep -rn 'from "../api/\|from "\.\./api/' "$wf" 2>/dev/null | grep -q .; then
  grn "workflow UI imports the API client"
else red "workflow UI never imports the API client — actions cannot reach the server"; fi
grep -rqiE 'client\.|Client\(' "$wf" 2>/dev/null && grn "action submit invokes a client call" || red "no client invocation in workflow action path"
# FAIL-CLOSED: audit-flagged CustomEvent dispatch hack must be gone
if grep -rn 'CustomEvent' "$wf" 2>/dev/null | grep -q .; then
  red "window CustomEvent dispatch hack still present in workflow UI (audit finding)"
else grn "no CustomEvent dispatch hack in workflow UI"; fi

# --- 3. Canonical states in the inbox ----------------------------------------------------------------
for state in loading error empty; do
  grep -rqi "$state" "$wf" 2>/dev/null && grn "inbox handles state: $state" || red "inbox missing state branch: $state"
done
grep -rqiE 'catch|HrmsApiError' "$wf" 2>/dev/null && grn "workflow UI catches API failures" || red "workflow UI does not catch API failures"

# --- 4. Task actions cover the P01 verb set -----------------------------------------------------------
while IFS= read -r action; do
  [ -z "$action" ] && continue
  grep -rqi "$action" "$wf" 2>/dev/null && grn "task action available: $action" || red "task action missing: $action"
done <<'EOF'
approve
reject
delegate
send-back
claim
EOF

# --- 5. Behavioural workflow test exists AND suites pass ----------------------------------------------
t=apps/web/test/ph05-workflow.test.cjs
if [ -s "$t" ]; then
  grn "workflow UI test present: $t"
  grep -qiE 'submit|onSubmit|form' "$t" && grn "test exercises form submission" || red "test does not exercise form submission"
  grep -qiE 'reason|comment' "$t" && grn "test asserts mandatory comment behaviour" || red "test does not assert mandatory comment"
  grep -qiE 'loading|error' "$t" && grn "test asserts loading/error states" || red "test does not assert loading/error states"
else red "missing workflow UI test: $t"; fi

# --- 6. Hygiene + toolchain (RED on fail; RED if deps absent — code phase) ----------------------------
if grep -rn 'console\.log\|localhost' apps/web/src 2>/dev/null | grep -q .; then
  red "console.log/localhost in web src"; else grn "web src hygiene clean"; fi
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm typecheck passes" || red "npm typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test passes (API suite)" || red "npm test failed"
  npm run -s web:typecheck >/dev/null 2>&1 && grn "npm web:typecheck passes" || red "npm web:typecheck failed"
  npm run -s web:test >/dev/null 2>&1 && grn "npm web:test passes" || red "npm web:test failed"
else
  red "node_modules absent — PH-05C is a code phase; run npm install, then all four checks must pass"
fi

echo "== $([ $fail -eq 0 ] && echo 'GREEN — PH-05C met' || echo 'RED — PH-05C not complete') =="; exit $fail
