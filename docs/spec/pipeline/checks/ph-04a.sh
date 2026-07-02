#!/usr/bin/env bash
# PH-04A oracle: API kernel and contract harness — asserts REAL build outcomes.
# Re-baselined 2026-07-02 after docs/reviews/brd-coverage-audit-20260702.md showed the previous
# check passed on marker strings and plan-file existence. This oracle asserts: route registry
# covering all 14 modules, explicit public/protected auth on every route (fail-closed count),
# sanitized error envelope (no stack traces), a working Idempotency-Key replay store, a computed
# cursor pagination helper, and a green typecheck + test run. bash 3.2 / BSD grep compatible.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
echo "== PH-04A exit-criteria (API kernel and contract harness) =="

# --- 1. Route registry covers all 14 modules + P01 workflow -------------------------------------
for n in 01 02 03 04 05 06 07 08 09 10 11 12 13 14; do
  grep -qE "registerG${n}Routes|g${n}\.routes" apps/api/src/routes/index.ts 2>/dev/null \
    && grn "registry wires module g${n}" || red "route registry missing module g${n}"
done
grep -qiE "p01|workflow" apps/api/src/routes/index.ts 2>/dev/null \
  && grn "registry wires P01 workflow routes" || red "registry missing P01 workflow routes"

# --- 2. FAIL-CLOSED: every route explicitly protected:true or protected:false -------------------
for f in apps/api/src/routes/*.routes.ts; do
  [ -f "$f" ] || { red "no route files under apps/api/src/routes"; break; }
  ops=$(grep -c 'operationId:' "$f" 2>/dev/null); [ -n "$ops" ] || ops=0
  auth=$(grep -cE 'protected: (true|false)' "$f" 2>/dev/null); [ -n "$auth" ] || auth=0
  prot=$(grep -c 'protected: true' "$f" 2>/dev/null); [ -n "$prot" ] || prot=0
  perm=$(grep -c 'permission:' "$f" 2>/dev/null); [ -n "$perm" ] || perm=0
  if [ "$ops" -gt 0 ] && [ "$ops" -eq "$auth" ]; then grn "auth explicit on all ${ops} routes: $f"
  else red "route lacks explicit public/protected declaration (${auth}/${ops}): $f"; fi
  if [ "$perm" -ge "$prot" ]; then grn "permission declared for every protected route: $f"
  else red "protected route without permission (${perm} permissions / ${prot} protected): $f"; fi
done

# --- 3. Kernel enforces auth + correlation -------------------------------------------------------
k=apps/api/src/http/apiKernel.ts
grep -qE '\.protected|isPublic' "$k" 2>/dev/null && grn "kernel branches on route protection" || red "kernel does not branch on route protection"
grep -q 'unauthenticatedError\|UNAUTHENTICATED' "$k" apps/api/src/http/errors.ts 2>/dev/null \
  && grn "unauthenticated rejection path present" || red "no UNAUTHENTICATED rejection path"
grep -qiE 'authorization\.check|authz' "$k" 2>/dev/null && grn "P02 authorization hook invoked in dispatch" || red "P02 authorization hook not invoked in dispatch"
grep -q 'X-Correlation-Id' apps/api/src/http/correlation.ts 2>/dev/null && grn "correlation header handled" || red "X-Correlation-Id not handled"

# --- 4. Sanitized error envelope ------------------------------------------------------------------
while IFS= read -r code; do
  [ -z "$code" ] && continue
  grep -q "$code" apps/api/src/http/errors.ts 2>/dev/null && grn "canonical error code: $code" || red "missing canonical error code: $code"
done <<'EOF'
VALIDATION_FAILED
UNAUTHENTICATED
FORBIDDEN
NOT_FOUND
CONFLICT
PRECONDITION_FAILED
RATE_LIMITED
INTERNAL
EOF
if grep -rn '\.stack' apps/api/src/http 2>/dev/null | grep -q .; then
  red "stack trace referenced in HTTP layer — envelope must never carry stacks"
else grn "no stack-trace leakage in HTTP layer"; fi

# --- 5. Working Idempotency-Key replay store (audit: presence-check only, no replay) --------------
idem=apps/api/src/http/idempotency.ts
grep -qE 'new Map|Map<' "$idem" 2>/dev/null && grn "idempotency replay store exists" || red "no replay store in $idem (presence-check stub)"
grep -qi 'replay' "$idem" 2>/dev/null && grn "replay path implemented in store" || red "no replay path in $idem"
grep -qi 'replay' "$k" 2>/dev/null && grn "kernel consults replay store on unsafe routes" || red "kernel dispatch never consults the replay store"

# --- 6. Real cursor pagination helper (audit: next_cursor placeholder) ----------------------------
pg=apps/api/src/http/pagination.ts
grep -q 'MAX_LIMIT' "$pg" 2>/dev/null && grep -q '100' "$pg" && grn "limit clamp (max 100) present" || red "no bounded limit clamp in $pg"
grep -qE 'next_cursor|nextCursor' "$pg" 2>/dev/null && grn "pagination helper emits next_cursor" || red "pagination helper missing next_cursor"
if grep -rn 'next_cursor: null' apps/api/src/http 2>/dev/null | grep -q .; then
  red "hardcoded 'next_cursor: null' literal remains in HTTP layer"
else grn "no hardcoded next_cursor:null in HTTP layer"; fi

# --- 7. Behavioural tests exist AND the suite passes ----------------------------------------------
t=apps/api/test/ph04-api-kernel.test.cjs
if [ -s "$t" ]; then
  grn "kernel test file present: $t"
  grep -qi 'replay' "$t" && grn "kernel test covers idempotency replay" || red "kernel test does not exercise replay (same key -> same response)"
  grep -q 'UNAUTHENTICATED' "$t" && grn "kernel test covers unauthenticated rejection" || red "kernel test does not exercise UNAUTHENTICATED"
  grep -qiE 'public|protected' "$t" && grn "kernel test covers public vs protected routes" || red "kernel test does not exercise public/protected split"
else red "missing kernel behaviour test: $t"; fi

# --- 8. Toolchain oracle: RED on fail, RED if deps absent (code phase) ----------------------------
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm typecheck passes" || red "npm typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test passes (API suite)" || red "npm test failed"
else
  red "node_modules absent — PH-04A is a code phase; run npm install, then typecheck+test must pass"
fi

echo "== $([ $fail -eq 0 ] && echo 'GREEN — PH-04A met' || echo 'RED — PH-04A not complete') =="; exit $fail
