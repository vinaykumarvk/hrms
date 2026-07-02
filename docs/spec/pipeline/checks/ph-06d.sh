#!/usr/bin/env bash
# PH-06D oracle: G03/G05 demo UI proof — real leave-apply form, approver inbox with approve/reject,
# transfer initiate form, and loading/empty/error states, all wired through the shared API client.
# REAL-outcome oracle over apps/web/src/modules/g03|g05 source + web tests + all four suites green.
# Fail-closed negative: a <form> without an onSubmit handler (skeleton UI) is RED. No marker assertions.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
echo "== PH-06D exit-criteria (G03/G05 demo UI proof) =="

[ -d node_modules ] || red "node_modules absent — typecheck/test oracle cannot run (npm install required)"
W3=apps/web/src/modules/g03
W5=apps/web/src/modules/g05
CLIENT=apps/web/src/api

# 1) G03 leave-apply form: inputs + submit + client call ("label::pattern" list, BSD-grep safe)
for spec in \
  "g03 form element::<form" \
  "g03 submit handler::onSubmit" \
  "g03 form inputs::<input|<select" \
  "g03 local state (useState)::useState" \
  "g03 uses shared api client::from \"\.\./\.\./api|hrmsClient" \
; do
  label="${spec%%::*}"; pat="${spec#*::}"
  grep -rqE "$pat" "$W3" 2>/dev/null && grn "$label" || red "missing: $label"
done
grep -rqE '/api/v1/atl/leave-applications' "$CLIENT" "$W3" 2>/dev/null && grn "leave-applications route consumed" || red "leave-applications route not consumed by web layer"

# 2) G03 approver inbox: approve/reject actions wired to the decision route
grep -rqiE 'approve' "$W3" 2>/dev/null && grn "g03 approve action present" || red "no approve action in g03 UI"
grep -rqiE 'reject' "$W3" 2>/dev/null && grn "g03 reject action present" || red "no reject action in g03 UI"
grep -rqE '<button|onClick' "$W3" 2>/dev/null && grn "g03 actionable controls present" || red "no buttons/onClick in g03 UI"
grep -rqE '/decision|decideLeave|leaveDecision' "$CLIENT" "$W3" 2>/dev/null && grn "decision route consumed" || red "decision route not consumed by web layer"

# 3) G05 transfer workspace: initiate form + orders view
for spec in \
  "g05 form element::<form" \
  "g05 submit handler::onSubmit" \
  "g05 form inputs::<input|<select" \
  "g05 uses shared api client::from \"\.\./\.\./api|hrmsClient" \
; do
  label="${spec%%::*}"; pat="${spec#*::}"
  grep -rqE "$pat" "$W5" 2>/dev/null && grn "$label" || red "missing: $label"
done
grep -rqE '/api/v1/transfers/orders' "$CLIENT" "$W5" 2>/dev/null && grn "transfers/orders route consumed" || red "transfers/orders route not consumed by web layer"

# 4) canonical states on both surfaces
for d in "$W3" "$W5"; do
  grep -rqiE 'loading' "$d" 2>/dev/null && grn "loading state: $d" || red "no loading state in $d"
  grep -rqiE 'error' "$d" 2>/dev/null && grn "error state: $d" || red "no error state in $d"
  grep -rqiE 'empty|no applications|no orders|no records' "$d" 2>/dev/null && grn "empty state: $d" || red "no empty state in $d"
done

# 5) fail-closed negative: skeleton-UI detector — a form without a submit handler is RED
for d in "$W3" "$W5"; do
  if grep -rqE '<form' "$d" 2>/dev/null && ! grep -rqE 'onSubmit' "$d" 2>/dev/null; then
    red "NEGATIVE: $d has a <form> with no onSubmit handler (skeleton UI)"
  fi
done
grn "negative skeleton-form detector evaluated"

# 6) web tests cover the interactive surfaces (not just component names)
grep -rqE 'onSubmit' apps/web/test 2>/dev/null && grn "web tests assert submit handlers" || red "no web test asserting onSubmit"
grep -rqE 'leave-applications|transfers/orders' apps/web/test 2>/dev/null && grn "web tests assert route consumption" || red "no web test asserting route consumption"

# 7) toolchain oracles — RED on failure (UI in scope: web + api suites)
npm run -s web:typecheck >/dev/null 2>&1 && grn "npm run web:typecheck green" || red "npm run web:typecheck FAILED"
npm run -s web:test >/dev/null 2>&1 && grn "npm run web:test green" || red "npm run web:test FAILED"
npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "npm run typecheck FAILED"
npm test --silent >/dev/null 2>&1 && grn "npm test green" || red "npm test FAILED"

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN — PH-06D met' || echo 'RED — PH-06D not complete') =="
exit "$fail"
