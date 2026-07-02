#!/usr/bin/env bash
# PH-05D oracle: G01/G12/G13 foundation record views — asserts REAL build outcomes.
# Re-baselined 2026-07-02 after docs/reviews/brd-coverage-audit-20260702.md found the record
# views render fixture props with zero API calls (DocumentVaultView has no fetch/useEffect).
# This oracle asserts: each view fetches through the API client, renders the BRD field lists,
# shows masked PII for G01 (aadhaar XXXX-XXXX-1234 style), G12 timeline exposes cursor paging,
# G13 renders documents with legal-hold/retention, all with loading/error branches, and green
# toolchains. bash 3.2 / BSD grep compatible.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
echo "== PH-05D exit-criteria (G01/G12/G13 record views) =="

# --- 1. Every foundation view fetches from the API (FAIL-CLOSED on fixture-only rendering) ---------
for m in g01 g12 g13; do
  d="apps/web/src/modules/$m"
  if grep -rn 'from "../../api/\|from "\.\./\.\./api/' "$d" 2>/dev/null | grep -q .; then
    grn "$m view imports the API client"
  else red "$m view never imports the API client (fixture-props rendering, audit finding)"; fi
  grep -rq 'useEffect' "$d" 2>/dev/null && grn "$m view loads data on mount (useEffect)" || red "$m view has no data-loading effect"
  for state in loading error; do
    grep -rqi "$state" "$d" 2>/dev/null && grn "$m view handles state: $state" || red "$m view missing state branch: $state"
  done
done

# --- 2. G01: rendered field list + masked PII display ------------------------------------------------
g01=apps/web/src/modules/g01
grep -rq 'serviceNo' "$g01" 2>/dev/null && grn "G01 renders service number" || red "G01 view does not render serviceNo"
grep -rq 'displayName' "$g01" 2>/dev/null && grn "G01 renders display name" || red "G01 view does not render displayName"
grep -rqiE 'designation|org' "$g01" 2>/dev/null && grn "G01 renders designation/org placement" || red "G01 view does not render designation/org fields"
grep -rqi 'aadhaar' "$g01" 2>/dev/null && grn "G01 surfaces Aadhaar as a governed field" || red "G01 view does not surface Aadhaar"
grep -rqiE 'XXXX|masked' "$g01" 2>/dev/null && grn "G01 shows masked PII display (P02)" || red "G01 view has no masked-PII display"
grep -rq 'fieldGrants' "$g01" 2>/dev/null && grn "G01 masking driven by fieldGrants" || red "G01 masking not driven by fieldGrants"

# --- 3. G12: timeline with cursor paging --------------------------------------------------------------
g12=apps/web/src/modules/g12
grep -rqiE 'cursor|load more|loadMore' "$g12" 2>/dev/null && grn "G12 timeline pages by cursor" || red "G12 timeline has no cursor paging affordance"
grep -rq 'entryHash' "$g12" 2>/dev/null && grn "G12 timeline renders hash-chain evidence" || red "G12 timeline missing hash-chain fields"
grep -rqiE 'append-only|reversal|corrigendum' "$g12" 2>/dev/null && grn "G12 timeline reflects ledger semantics" || red "G12 timeline lacks ledger semantics"

# --- 4. G13: document vault backed by the API ----------------------------------------------------------
g13=apps/web/src/modules/g13
grep -rqiE 'legalHold|legal_hold' "$g13" 2>/dev/null && grn "G13 renders legal-hold state" || red "G13 view missing legal-hold state"
grep -rqi 'retention' "$g13" 2>/dev/null && grn "G13 renders retention state" || red "G13 view missing retention state"
grep -rqiE 'version' "$g13" 2>/dev/null && grn "G13 renders document versions" || red "G13 view missing versions"

# --- 5. Behavioural records test exists AND suites pass -------------------------------------------------
t=apps/web/test/ph05-records.test.cjs
if [ -s "$t" ]; then
  grn "records test present: $t"
  grep -qiE 'fetch|client' "$t" && grn "test asserts API-backed rendering" || red "test does not assert API-backed rendering"
  grep -qiE 'masked|XXXX' "$t" && grn "test asserts masked-PII display" || red "test does not assert masked-PII display"
  grep -qiE 'cursor|load more|loadMore' "$t" && grn "test asserts timeline paging" || red "test does not assert timeline paging"
else red "missing records behaviour test: $t"; fi

# --- 6. Hygiene + toolchain (RED on fail; RED if deps absent — code phase) ------------------------------
if grep -rn 'fixtureHrmsClient\|createFixtureHrmsClient' apps/web/src/modules 2>/dev/null | grep -q .; then
  red "module views import the fixture client (must consume the real client)"
else grn "no fixture client in module views"; fi
if grep -rn 'console\.log\|localhost' apps/web/src 2>/dev/null | grep -q .; then
  red "console.log/localhost in web src"; else grn "web src hygiene clean"; fi
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm typecheck passes" || red "npm typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test passes (API suite)" || red "npm test failed"
  npm run -s web:typecheck >/dev/null 2>&1 && grn "npm web:typecheck passes" || red "npm web:typecheck failed"
  npm run -s web:test >/dev/null 2>&1 && grn "npm web:test passes" || red "npm web:test failed"
else
  red "node_modules absent — PH-05D is a code phase; run npm install, then all four checks must pass"
fi

echo "== $([ $fail -eq 0 ] && echo 'GREEN — PH-05D met' || echo 'RED — PH-05D not complete') =="; exit $fail
