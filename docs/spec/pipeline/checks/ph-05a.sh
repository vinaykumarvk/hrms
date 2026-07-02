#!/usr/bin/env bash
# PH-05A oracle: web scaffold and API client foundation — asserts REAL build outcomes.
# Re-baselined 2026-07-02 after docs/reviews/brd-coverage-audit-20260702.md found the real
# fetch client (createHrmsClient) is never imported by the app — every view renders fixture
# props from createFixtureHrmsClient. This oracle asserts: a fetch-based client with error
# handling and auth header injection, the REAL client wired into the app, fixture confined to
# src/api + tests, no hardcoded localhost, and green web+API toolchains. bash 3.2 compatible.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
echo "== PH-05A exit-criteria (web scaffold + API client foundation) =="

# --- 1. Real fetch-based client with error handling and auth --------------------------------------
c=apps/web/src/api/hrmsClient.ts
[ -s "$c" ] && grn "API client present: $c" || red "missing API client: $c"
grep -q 'fetch' "$c" 2>/dev/null && grn "client performs real fetch calls" || red "client does not use fetch"
grep -qE 'response\.ok|res\.ok|status >= 400' "$c" 2>/dev/null && grep -q 'throw' "$c" 2>/dev/null \
  && grn "client raises typed errors on non-2xx responses" || red "client lacks non-2xx error handling"
grep -q 'Authorization' "$c" 2>/dev/null && grn "client injects Authorization header" || red "client does not inject an Authorization header"
grep -qiE 'bearer|token' "$c" 2>/dev/null && grn "client carries a bearer/session token" || red "client has no token plumbing"
grep -q 'X-Correlation-Id' "$c" 2>/dev/null && grn "client propagates X-Correlation-Id" || red "client missing X-Correlation-Id"
grep -q 'Idempotency-Key' "$c" 2>/dev/null && grn "client sends Idempotency-Key on unsafe calls" || red "client missing Idempotency-Key on unsafe calls"

# --- 2. FAIL-CLOSED: the real client must be what the app consumes --------------------------------
if grep -rn 'createHrmsClient' apps/web/src 2>/dev/null | grep -v 'src/api/' | grep -q .; then
  grn "real client (createHrmsClient) is consumed outside src/api"
else red "createHrmsClient is never imported by the app — views are not wired to the API"; fi
if grep -rn 'fixtureHrmsClient\|createFixtureHrmsClient' apps/web/src 2>/dev/null | grep -v 'src/api/' | grep -q .; then
  red "fixture client consumed in production src (allowed only inside src/api and tests)"
else grn "fixture client confined to src/api/tests"; fi

# --- 3. Security/hygiene negatives -----------------------------------------------------------------
if grep -rn 'localhost' apps/web/src 2>/dev/null | grep -q .; then
  red "hardcoded localhost in web production paths"; else grn "no hardcoded localhost in apps/web/src"; fi
if grep -rn 'console\.log' apps/web/src 2>/dev/null | grep -q .; then
  red "console.log in web production src"; else grn "no console.log in apps/web/src"; fi
if grep -rnE 'as any|: any($|[^A-Za-z])' apps/web/src/api 2>/dev/null | grep -q .; then
  red "TypeScript any in API client"; else grn "no TypeScript any in API client"; fi

# --- 4. Behavioural client test exists AND suites pass ---------------------------------------------
t=apps/web/test/ph05-api-client.test.cjs
if [ -s "$t" ]; then
  grn "client test present: $t"
  grep -q 'fetch' "$t" && grn "client test stubs/asserts fetch behaviour" || red "client test does not exercise fetch"
  grep -q 'Authorization' "$t" && grn "client test asserts auth header injection" || red "client test does not assert Authorization header"
  grep -qiE 'error|reject|throw' "$t" && grn "client test covers the error path" || red "client test does not cover the error path"
else red "missing client behaviour test: $t"; fi

# --- 5. Toolchain (RED on fail; RED if deps absent — code phase) -----------------------------------
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm typecheck passes" || red "npm typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test passes (API suite)" || red "npm test failed"
  npm run -s web:typecheck >/dev/null 2>&1 && grn "npm web:typecheck passes" || red "npm web:typecheck failed"
  npm run -s web:test >/dev/null 2>&1 && grn "npm web:test passes" || red "npm web:test failed"
else
  red "node_modules absent — PH-05A is a code phase; run npm install, then all four checks must pass"
fi

echo "== $([ $fail -eq 0 ] && echo 'GREEN — PH-05A met' || echo 'RED — PH-05A not complete') =="; exit $fail
