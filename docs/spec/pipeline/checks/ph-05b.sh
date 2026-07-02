#!/usr/bin/env bash
# PH-05B oracle: HRMS shell, workspaces, route guards — asserts REAL build outcomes.
# Re-baselined 2026-07-02 after docs/reviews/brd-coverage-audit-20260702.md found only 5 nav
# items for 14 modules and a route guard rendered decorative by App passing permissions={["*"]}.
# This oracle asserts: navigation reaching all 14 module workspaces, a guard that actually gates
# render on entitlements, real login/denied states, and green toolchains. bash 3.2 compatible.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
echo "== PH-05B exit-criteria (shell, workspaces, route guards) =="

# --- 1. Navigation reaches all 14 module workspaces (BRD G01-G14 surfaces) -------------------------
nav=apps/web/src/app/navigation.ts
[ -s "$nav" ] || red "missing navigation model: $nav"
while IFS= read -r spec; do
  [ -z "$spec" ] && continue
  label="${spec%%::*}"; pat="${spec#*::}"
  grep -qiE "$pat" "$nav" 2>/dev/null && grn "workspace nav: $label" || red "navigation missing workspace: $label"
done <<'EOF'
G01 employees::employee
G02 personal details::personal-details|personal_details
G03 attendance/leave::attendance|leave
G04 leave-SR relay::leave-sr|relay
G05 transfers::transfer
G06 promotions::promotion
G07 training::training
G08 APAR/performance::apar|appraisal|performance
G09 disciplinary::disciplinary
G10 payroll::payroll
G11 pension/retirement::pension|retirement
G12 service register::service-register|service_register
G13 documents::document
G14 analytics::analytics|dashboard
EOF

# --- 2. Route guard actually gates render on entitlements ------------------------------------------
rg=apps/web/src/app/RouteGuard.tsx
grep -q 'canAccess' "$rg" 2>/dev/null && grn "guard evaluates entitlements via canAccess" || red "guard does not evaluate entitlements"
grep -q 'no-permission' "$rg" 2>/dev/null && grn "guard renders denied state instead of children" || red "guard has no denied render path"
n=$(grep -rn 'requiredPermission=' apps/web/src 2>/dev/null | grep -cv '/test/'); [ -n "$n" ] || n=0
if [ "$n" -ge 14 ]; then grn "guard applied per workspace (${n} guarded surfaces >= 14)"
else red "only ${n} guarded surfaces — every module workspace must sit behind the guard"; fi

# --- 3. FAIL-CLOSED: wildcard grant made the guard decorative (audit finding) ----------------------
if grep -rn 'permissions={\["\*"\]}' apps/web/src 2>/dev/null | grep -v '/test/' | grep -q .; then
  red 'App hardcodes permissions={["*"]} — guard is decorative; permissions must come from the session'
else grn "no hardcoded wildcard permission grant in app src"; fi

# --- 4. Login and denied states ---------------------------------------------------------------------
if grep -rniE 'login|sign[- ]?in' apps/web/src/app apps/web/src/App.tsx 2>/dev/null | grep -q .; then
  grn "login/sign-in state present"; else red "no login/sign-in state in the shell"; fi
grep -rq 'no-permission' apps/web/src/app 2>/dev/null && grn "denied (no-permission) state present" || red "no denied state"
grep -rqiE 'session|currentUser|auth' apps/web/src/app apps/web/src/App.tsx 2>/dev/null \
  && grn "shell derives identity/permissions from a session source" || red "shell has no session/identity source"

# --- 5. Behavioural shell test exists AND suites pass -----------------------------------------------
t=apps/web/test/ph05-shell.test.cjs
if [ -s "$t" ]; then
  grn "shell test present: $t"
  grep -qiE 'no-permission|denied' "$t" && grn "shell test asserts denied rendering" || red "shell test does not assert denied rendering"
  grep -qiE 'login|sign' "$t" && grn "shell test asserts login state" || red "shell test does not assert login state"
else red "missing shell behaviour test: $t"; fi

# --- 6. Hygiene + toolchain (RED on fail; RED if deps absent — code phase) --------------------------
if grep -rn 'console\.log\|localhost' apps/web/src 2>/dev/null | grep -q .; then
  red "console.log/localhost in web src"; else grn "web src hygiene clean"; fi
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm typecheck passes" || red "npm typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test passes (API suite)" || red "npm test failed"
  npm run -s web:typecheck >/dev/null 2>&1 && grn "npm web:typecheck passes" || red "npm web:typecheck failed"
  npm run -s web:test >/dev/null 2>&1 && grn "npm web:test passes" || red "npm web:test failed"
else
  red "node_modules absent — PH-05B is a code phase; run npm install, then all four checks must pass"
fi

echo "== $([ $fail -eq 0 ] && echo 'GREEN — PH-05B met' || echo 'RED — PH-05B not complete') =="; exit $fail
